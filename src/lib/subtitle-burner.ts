/**
 * CapCut-style subtitle burner using FFmpeg.wasm drawtext filter.
 * Renders bold, UPPERCASE subtitles centered at bottom with strong outline.
 * 
 * KEY FIX: fontSize is now calculated as a percentage of video height
 * to ensure consistent, large, readable text across all resolutions.
 */

import { getFFmpeg } from '@/lib/video-processor';
import { fetchFile } from '@ffmpeg/util';
import type { TranscriptionSegment } from './whisper-transcriber';

interface BurnOptions {
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
}

const FONT_PATH = '/fonts/Inter-Variable.ttf';
const FONT_FS_NAME = 'subtitle_font.ttf';

/**
 * Sanitize text for FFmpeg drawtext — remove ALL problematic characters.
 */
function sanitizeForDrawtext(text: string): string {
  let clean = text.toUpperCase().trim();
  // Remove characters that break FFmpeg drawtext parsing
  // Keep only letters, numbers, spaces, and basic punctuation
  clean = clean.replace(/[^A-ZÀ-ÿ0-9 .!?,\-]/gi, '');
  // Escape special chars for drawtext
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
      // Match "Stream #0:0: Video: ... 1080x1920" or similar
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

    // Run a quick probe
    ffmpeg.exec(['-i', inputName, '-f', 'null', '-t', '0.01', '-']).catch(() => {}).finally(() => {
      ffmpeg.off('log', handler);
      resolve({ width, height });
    });
  });
}

/**
 * Build drawtext filter chain for all segments.
 * fontSize is calculated from video height percentage.
 */
export function buildDrawtextFilter(
  options: BurnOptions,
  fontFile: string,
  videoHeight: number,
): string {
  const { segments, style, fontSizePct, position } = options;

  // Calculate actual pixel font size from percentage of video height
  // e.g. 5% of 1920 = 96px, 5% of 1080 = 54px
  const fontSize = Math.round((fontSizePct / 100) * videoHeight);
  const borderW = Math.max(style.borderW, Math.round(fontSize * 0.06)); // 6% of font size
  const shadowDist = Math.max(3, Math.round(fontSize * 0.05));
  const marginBottom = Math.round(videoHeight * 0.08); // 8% margin from edge

  const yExpr = position === 'top'
    ? `${marginBottom}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-text_h-${marginBottom}`;

  const filters: string[] = [];

  for (const seg of segments) {
    const text = sanitizeForDrawtext(seg.text);
    if (!text) continue;

    const startSec = (seg.fromMs / 1000).toFixed(3);
    const endSec = (seg.toMs / 1000).toFixed(3);

    const parts = [
      `drawtext=fontfile=${fontFile}`,
      `text='${text}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${hexToFFmpeg(style.fontColor)}`,
      `borderw=${borderW}`,
      `bordercolor=${hexToFFmpeg(style.borderColor)}`,
      `shadowcolor=0x000000@0.9`,
      `shadowx=${shadowDist}`,
      `shadowy=${shadowDist}`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `enable='between(t\\,${startSec}\\,${endSec})'`,
    ];

    // Add background box if style requires it
    if (style.bgColor !== 'transparent' && style.bgColor !== '#00000000') {
      const boxPad = Math.round(fontSize * 0.2);
      parts.push(`box=1`);
      parts.push(`boxcolor=${hexToFFmpeg(style.bgColor)}@0.8`);
      parts.push(`boxborderw=${boxPad}`);
    }

    filters.push(parts.join(':'));
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

  // Probe video dimensions to calculate correct font size
  onProgress?.(12, 'Analisando dimensões do vídeo...');
  const { height: videoHeight } = await probeVideoDimensions(ffmpeg, inputName);
  console.log('[SubtitleBurner] Video height:', videoHeight, 'fontSizePct:', options.fontSizePct);

  const filterStr = buildDrawtextFilter(options, fontFile, videoHeight);
  console.log('[SubtitleBurner] Filter segments:', options.segments.length, 'Calculated font size:', Math.round((options.fontSizePct / 100) * videoHeight), 'px');

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
      onProgress?.(Math.round(pct), 'Gravando legendas...');
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

  // Cleanup
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(FONT_FS_NAME);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([outputBytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
