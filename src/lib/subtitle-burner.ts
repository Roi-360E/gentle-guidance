/**
 * CapCut-style subtitle burner using FFmpeg.wasm drawtext filter.
 * 
 * KEY FEATURE: Word-by-word highlighting
 * - Splits segments into word groups (3-4 words)
 * - Each word gets highlighted in accent color while others stay primary
 * - Two-layer rendering: base text (primary) + highlighted word overlay
 * - Font size calculated as % of video height for consistency
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
  wordsPerGroup?: number;
}

const FONT_PATH = '/fonts/Inter-Variable.ttf';
const FONT_FS_NAME = 'subtitle_font.ttf';

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
 * 
 * Strategy:
 * For each word group time slice, we render TWO layers:
 * 1. Base layer: full group text in primary color (centered)
 * 2. Highlight layer: just the highlighted word in highlight color, 
 *    positioned to overlap the correct word using character-width approximation
 */
export function buildDrawtextFilter(
  options: BurnOptions,
  fontFile: string,
  videoHeight: number,
  videoWidth: number,
): string {
  const { segments, style, fontSizePct, position, wordsPerGroup = 4 } = options;

  const fontSize = Math.round((fontSizePct / 100) * videoHeight);
  const borderW = Math.max(style.borderW, Math.round(fontSize * 0.06));
  const shadowDist = Math.max(3, Math.round(fontSize * 0.05));
  const marginBottom = Math.round(videoHeight * 0.08);

  // Approximate character width for Inter Bold uppercase: ~0.58 * fontSize
  const charWidth = fontSize * 0.58;
  const spaceWidth = fontSize * 0.25;

  const yExpr = position === 'top'
    ? `${marginBottom}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-text_h-${marginBottom}`;

  const wordGroups = splitSegmentsIntoWordGroups(segments, wordsPerGroup);
  const filters: string[] = [];

  // Common style params
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

  // Build bg params if needed
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

    // Layer 1: Full text in primary color (base)
    const baseParts = [
      `drawtext=${baseParams(style.fontColor).join(':')}`,
      `text='${fullText}'`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      enableExpr,
      ...bgParams,
    ];
    filters.push(baseParts.join(':'));

    // Layer 2: Highlighted word overlay in highlight color
    const highlightedWord = sanitizeForDrawtext(group.words[group.highlightIndex] || '');
    if (!highlightedWord) continue;

    // Calculate x offset for the highlighted word within the centered text
    // Total text width approximation
    const sanitizedWords = group.words.map(w => sanitizeForDrawtext(w));
    const totalTextWidth = sanitizedWords.reduce((sum, w) => sum + w.length * charWidth, 0) 
      + (sanitizedWords.length - 1) * spaceWidth;

    // Offset to the highlighted word start
    let offsetToWord = 0;
    for (let i = 0; i < group.highlightIndex; i++) {
      offsetToWord += sanitizedWords[i].length * charWidth + spaceWidth;
    }

    // Center the full text, then offset to the word
    // x = (w - totalTextWidth) / 2 + offsetToWord
    const xExpr = `(w-${Math.round(totalTextWidth)})/2+${Math.round(offsetToWord)}`;

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

export async function burnSubtitlesIntoVideo(
  videoFile: File,
  options: BurnOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<Blob> {
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
  const wordGroups = splitSegmentsIntoWordGroups(options.segments, options.wordsPerGroup || 4);
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
