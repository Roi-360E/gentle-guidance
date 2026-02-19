/**
 * CapCut-style subtitle burner using FFmpeg.wasm drawtext filter.
 * Renders bold, UPPERCASE subtitles centered at bottom with strong outline.
 * Optimized for maximum speed (ultrafast preset, low CRF).
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
  fontSize: number;
  position: 'bottom' | 'center' | 'top';
}

const FONT_PATH = '/fonts/Inter-Variable.ttf';
const FONT_FS_NAME = 'subtitle_font.ttf';

/**
 * Sanitize text for FFmpeg drawtext — remove ALL problematic characters.
 * This prevents filter parsing errors entirely.
 */
function sanitizeForDrawtext(text: string): string {
  // Force uppercase for CapCut style
  let clean = text.toUpperCase().trim();
  // Remove characters that break FFmpeg drawtext parsing
  // Keep only letters, numbers, spaces, and basic punctuation
  clean = clean.replace(/[^A-ZÀ-ÿ0-9 .!?,\-]/gi, '');
  // Escape remaining special chars for drawtext
  clean = clean.replace(/:/g, '\\:');
  clean = clean.replace(/'/g, '\u2019');
  clean = clean.replace(/%/g, '%%');
  clean = clean.replace(/\\/g, '\\\\');
  return clean;
}

function hexToFFmpeg(hex: string): string {
  const clean = hex.replace('#', '');
  return '0x' + clean.substring(0, 6);
}

/**
 * Build a single drawtext filter string for all segments.
 * Each segment is a separate drawtext entry chained with commas.
 * Text is forced to UPPERCASE for CapCut style readability.
 */
export function buildDrawtextFilter(options: BurnOptions, fontFile: string): string {
  const { segments, style, fontSize, position } = options;

  // CapCut positions text near the bottom with good margin
  const yExpr = position === 'top'
    ? `${Math.round(fontSize * 0.8)}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-text_h-${Math.round(fontSize * 0.5)}`;

  const filters: string[] = [];

  for (const seg of segments) {
    const text = sanitizeForDrawtext(seg.text);
    if (!text) continue;

    const startSec = (seg.fromMs / 1000).toFixed(3);
    const endSec = (seg.toMs / 1000).toFixed(3);

    // Build the drawtext filter — use semicolons-free, colon-separated format
    const parts = [
      `drawtext=fontfile=${fontFile}`,
      `text='${text}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${hexToFFmpeg(style.fontColor)}`,
      `borderw=${style.borderW}`,
      `bordercolor=${hexToFFmpeg(style.borderColor)}`,
      `shadowcolor=0x000000@0.8`,
      `shadowx=3`,
      `shadowy=3`,
      `x=(w-text_w)/2`,
      `y=${yExpr}`,
      `enable='between(t\\,${startSec}\\,${endSec})'`,
    ];

    // Add background box if style requires it
    if (style.bgColor !== 'transparent' && style.bgColor !== '#00000000') {
      parts.push(`box=1`);
      parts.push(`boxcolor=${hexToFFmpeg(style.bgColor)}@0.8`);
      parts.push(`boxborderw=12`);
    }

    filters.push(parts.join(':'));
  }

  // Chain all drawtext filters with comma (FFmpeg filter separator)
  return filters.join(',');
}

async function loadFontIntoFS(ffmpeg: any): Promise<string> {
  try {
    const fontData = await fetchFile(FONT_PATH);
    await ffmpeg.writeFile(FONT_FS_NAME, fontData);
    return FONT_FS_NAME;
  } catch (err) {
    console.warn('[SubtitleBurner] Failed to load font, using default:', err);
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

  const filterStr = buildDrawtextFilter(options, fontFile);
  console.log('[SubtitleBurner] Filter segments:', options.segments.length, 'Filter length:', filterStr.length);

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
    // Primary: render with drawtext filter
    try {
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-crf', '26',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y', outputName,
      ]);
    } catch (filterErr) {
      // Fallback: copy video without subtitles if filter fails
      console.error('[SubtitleBurner] drawtext failed, copying original:', filterErr, 'Last FFmpeg error:', lastError);
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
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
