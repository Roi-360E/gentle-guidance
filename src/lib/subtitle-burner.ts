/**
 * CapCut-style subtitle burner using FFmpeg.wasm drawtext filter.
 * 
 * KEY FEATURE: Word-by-word highlighting
 * - For large files (>50MB), uses VPS native FFmpeg for burning
 * - For smaller files, uses FFmpeg.wasm in browser
 */

import { getFFmpeg } from '@/lib/video-processor';
import { fetchFile } from '@ffmpeg/util';
import type { TranscriptionSegment } from './whisper-transcriber';
import { splitSegmentsIntoWordGroups, type WordGroup } from './subtitle-styles';

export interface BurnOptions {
  segments: TranscriptionSegment[];
  style: {
    fontColor: string;
    highlightColor: string;
    borderColor: string;
    bgColor: string;
    borderW: number;
    bold: boolean;
  };
  /** fontSize as percentage of video height (e.g. 5 = 5%) */
  fontSizePct: number;
  position: 'bottom' | 'center' | 'top';
  textAlign?: 'left' | 'center' | 'right';
  wordsPerGroup?: number;
  maxLines?: number;
}

const FONT_PATH = '/fonts/Inter-Variable.ttf';
const FONT_FS_NAME = 'subtitle_font.ttf';

/** Threshold for VPS processing — lowered to route more files to native FFmpeg */
const VPS_THRESHOLD = 20 * 1024 * 1024; // 20MB
const VPS_URL = 'https://api.deploysites.online';

/** Max concurrent VPS burn requests for batch processing */
const VPS_CONCURRENCY = 3;

/**
 * Sanitize text for FFmpeg drawtext
 */
function sanitizeForDrawtext(text: string): string {
  let clean = text.toUpperCase().trim();
  clean = clean.replace(/[^A-ZÀ-ÿ0-9 .!?,\-]/gi, '');
  clean = clean.replace(/:/g, '\\:');
  clean = clean.replace(/'/g, '\u2019');
  clean = clean.replace(/%/g, '%%');
  return clean;
}

function hexToFFmpeg(hex: string): string {
  const clean = hex.replace('#', '');
  return '0x' + clean.substring(0, 6);
}

/**
 * Probe video dimensions using FFmpeg
 */
async function probeVideoDimensions(ffmpeg: any, inputName: string): Promise<{ width: number; height: number }> {
  let width = 1080;
  let height = 1920;

  return new Promise((resolve) => {
    const handler = ({ message }: { message: string }) => {
      const match = message.match(/(\d{2,5})x(\d{2,5})/);
      if (match) {
        const w = Number(match[1]);
        const h = Number(match[2]);
        if (w > 100 && h > 100) {
          width = w;
          height = h;
        }
      }
    };

    ffmpeg.on('log', handler);
    ffmpeg.exec(['-i', inputName, '-f', 'null', '-t', '0.01', '-']).catch(() => {}).finally(() => {
      ffmpeg.off('log', handler);
      resolve({ width, height });
    });
  });
}

/**
 * Build drawtext filter chain with word-by-word highlighting.
 */
export function buildDrawtextFilter(
  options: BurnOptions,
  fontFile: string,
  videoHeight: number,
  videoWidth: number,
): string {
  const { segments, style, fontSizePct, position, textAlign = 'center', wordsPerGroup = 4, maxLines = 2 } = options;

  const fontSize = Math.round((fontSizePct / 100) * videoHeight);
  const borderW = Math.max(style.borderW, Math.round(fontSize * 0.06));
  const shadowDist = Math.max(3, Math.round(fontSize * 0.05));
  const marginBottom = Math.round(videoHeight * 0.08);

  const charWidth = fontSize * 0.58;
  const spaceWidth = fontSize * 0.25;

  const yExpr = position === 'top'
    ? `${marginBottom}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-text_h-${marginBottom}`;

  const wordGroups = splitSegmentsIntoWordGroups(segments, wordsPerGroup, maxLines);
  const filters: string[] = [];

  const baseParams = (color: string) => [
    `fontfile=${fontFile}`,
    `fontsize=${fontSize}`,
    `fontcolor=${hexToFFmpeg(color)}`,
    `borderw=${borderW}`,
    `bordercolor=${hexToFFmpeg(style.borderColor)}`,
    `shadowcolor=0x000000@0.9`,
    `shadowx=${shadowDist}`,
    `shadowy=${shadowDist}`,
  ];

  const bgParams: string[] = [];
  if (style.bgColor !== 'transparent' && style.bgColor !== '#00000000') {
    const boxPad = Math.round(fontSize * 0.2);
    bgParams.push(`box=1`, `boxcolor=${hexToFFmpeg(style.bgColor)}@0.8`, `boxborderw=${boxPad}`);
  }

  for (const group of wordGroups) {
    const fullText = sanitizeForDrawtext(group.fullText);
    if (!fullText) continue;

    const startSec = (group.fromMs / 1000).toFixed(3);
    const endSec = (group.toMs / 1000).toFixed(3);
    const enableExpr = `enable='between(t\\,${startSec}\\,${endSec})'`;

    const baseParts = [
      `drawtext=${baseParams(style.fontColor).join(':')}`,
      `text='${fullText}'`,
      `x=${textAlign === 'left' ? `${marginBottom}` : textAlign === 'right' ? `w-text_w-${marginBottom}` : '(w-text_w)/2'}`,
      `y=${yExpr}`,
      enableExpr,
      ...bgParams,
    ];
    filters.push(baseParts.join(':'));

    const highlightedWord = sanitizeForDrawtext(group.words[group.highlightIndex] || '');
    if (!highlightedWord) continue;

    const sanitizedWords = group.words.map(w => sanitizeForDrawtext(w));
    const totalTextWidth = sanitizedWords.reduce((sum, w) => sum + w.length * charWidth, 0) 
      + (sanitizedWords.length - 1) * spaceWidth;

    let offsetToWord = 0;
    for (let i = 0; i < group.highlightIndex; i++) {
      offsetToWord += sanitizedWords[i].length * charWidth + spaceWidth;
    }

    const baseXExpr = textAlign === 'left' ? `${marginBottom}` : textAlign === 'right' ? `w-${Math.round(totalTextWidth)}-${marginBottom}` : `(w-${Math.round(totalTextWidth)})/2`;
    const xExpr = `${baseXExpr}+${Math.round(offsetToWord)}`;

    const highlightParts = [
      `drawtext=${baseParams(style.highlightColor).join(':')}`,
      `text='${highlightedWord}'`,
      `x=${xExpr}`,
      `y=${yExpr}`,
      enableExpr,
    ];
    filters.push(highlightParts.join(':'));
  }

  return filters.join(',');
}

async function loadFontIntoFS(ffmpeg: any): Promise<string> {
  try {
    const fontData = await fetchFile(FONT_PATH);
    await ffmpeg.writeFile(FONT_FS_NAME, fontData);
    console.log('[SubtitleBurner] Font loaded, size:', fontData.length);
    return FONT_FS_NAME;
  } catch (err) {
    console.warn('[SubtitleBurner] Failed to load font:', err);
    return FONT_FS_NAME;
  }
}

/**
 * Burn subtitles via VPS for large files (native FFmpeg).
 * Builds the filter string locally then sends video + filter to VPS.
 */
async function burnSubtitlesViaVPS(
  videoFile: File,
  options: BurnOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<Blob> {
  const sizeMB = (videoFile.size / (1024 * 1024)).toFixed(1);
  onProgress?.(5, `Enviando vídeo (${sizeMB}MB) para servidor...`);

  // We need video dimensions — probe via a quick <video> element
  const dims = await new Promise<{ width: number; height: number }>((resolve) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      resolve({ width: vid.videoWidth || 1080, height: vid.videoHeight || 1920 });
      URL.revokeObjectURL(vid.src);
    };
    vid.onerror = () => {
      resolve({ width: 1080, height: 1920 });
      URL.revokeObjectURL(vid.src);
    };
    vid.src = URL.createObjectURL(videoFile);
  });

  onProgress?.(10, 'Construindo filtro de legendas...');
  const filterStr = buildDrawtextFilter(options, FONT_FS_NAME, dims.height, dims.width);
  console.log('[SubtitleBurner] VPS burn for', videoFile.name, `${dims.width}x${dims.height}`, 'filter length:', filterStr.length);

  const formData = new FormData();
  formData.append('video', videoFile, videoFile.name);
  formData.append('filter', filterStr);

  const controller = new AbortController();
  // Generous timeout: 3min base + 15s per 10MB (158MB → ~6min)
  const timeoutMs = 180000 + Math.ceil(videoFile.size / (10 * 1024 * 1024)) * 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  onProgress?.(15, 'Gravando legendas no servidor...');

  try {
    const res = await fetch(`${VPS_URL}/burn-subtitles`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      throw new Error(`VPS error: ${data.error}`);
    }
    if (!res.ok) {
      throw new Error(`VPS HTTP ${res.status}`);
    }

    onProgress?.(85, 'Baixando vídeo legendado...');
    const blob = await res.blob();
    
    if (blob.size < 1000) {
      throw new Error('VPS returned empty video');
    }

    console.log(`[SubtitleBurner] ✅ VPS burn complete: ${(blob.size / (1024 * 1024)).toFixed(1)}MB`);
    onProgress?.(100, 'Concluído!');
    return blob;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function burnSubtitlesIntoVideo(
  videoFile: File,
  options: BurnOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<Blob> {
  // Always try VPS first for speed (native FFmpeg is much faster than WASM)
  try {
    console.log(`[SubtitleBurner] 🌐 VPS burn for ${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(1)}MB)`);
    return await burnSubtitlesViaVPS(videoFile, options, onProgress);
  } catch (err) {
    console.warn('[SubtitleBurner] VPS burn failed, falling back to local WASM:', err);
    onProgress?.(5, 'Servidor indisponível, processando localmente...');
  }

  // Local WASM processing
  onProgress?.(5, 'Preparando FFmpeg...');
  const ffmpeg = await getFFmpeg();

  const inputName = `burn_in_${Date.now()}.mp4`;
  const outputName = `burn_out_${Date.now()}.mp4`;

  onProgress?.(8, 'Carregando fonte...');
  const fontFile = await loadFontIntoFS(ffmpeg);

  onProgress?.(10, 'Carregando vídeo...');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  onProgress?.(12, 'Analisando dimensões do vídeo...');
  const { width: videoWidth, height: videoHeight } = await probeVideoDimensions(ffmpeg, inputName);
  console.log('[SubtitleBurner] Video:', videoWidth, 'x', videoHeight, 'fontSizePct:', options.fontSizePct);

  const filterStr = buildDrawtextFilter(options, fontFile, videoHeight, videoWidth);
  const wordGroups = splitSegmentsIntoWordGroups(options.segments, options.wordsPerGroup || 4, options.maxLines || 2);
  console.log('[SubtitleBurner] Word groups:', wordGroups.length, 'Filter length:', filterStr.length);

  let duration = 0;
  let lastError = '';
  const logHandler = ({ message }: { message: string }) => {
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      lastError = message;
      console.warn('[SubtitleBurner] FFmpeg:', message);
    }
    const durMatch = message.match(/Duration:\s+(\d+):(\d+):(\d+)/);
    if (durMatch) {
      duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    }
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch && duration > 0) {
      const current = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
      const pct = Math.min(95, 20 + (current / duration) * 75);
      onProgress?.(Math.round(pct), 'Gravando legendas com destaque...');
    }
  };

  ffmpeg.on('log', logHandler);
  onProgress?.(20, 'Gravando legendas no vídeo...');

  try {
    try {
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-crf', '24',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y', outputName,
      ]);
    } catch (filterErr) {
      console.error('[SubtitleBurner] drawtext failed, copying original:', filterErr, 'Last FFmpeg error:', lastError);
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
        '-c:a', 'copy', '-movflags', '+faststart',
        '-y', outputName,
      ]);
    }
  } finally {
    ffmpeg.off('log', logHandler);
  }

  onProgress?.(95, 'Finalizando...');

  let outputData: any;
  try {
    outputData = await ffmpeg.readFile(outputName);
  } catch (readErr) {
    console.error('[SubtitleBurner] Read output failed:', readErr, 'Last error:', lastError);
    throw new Error('FFmpeg não produziu o arquivo de saída.');
  }

  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData as unknown as ArrayBuffer);

  if (outputBytes.length < 1000) {
    throw new Error('Vídeo de saída está vazio ou corrompido.');
  }

  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(FONT_FS_NAME);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([outputBytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
