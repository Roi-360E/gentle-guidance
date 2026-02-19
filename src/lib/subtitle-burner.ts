/**
 * Burn subtitles into video using FFmpeg.wasm drawtext filter
 * Uses a bundled font file to ensure text renders correctly in the browser.
 */

import { getFFmpeg } from '@/lib/video-processor';
import { fetchFile } from '@ffmpeg/util';
import type { TranscriptionSegment } from './whisper-transcriber';

interface BurnOptions {
  segments: TranscriptionSegment[];
  style: {
    fontColor: string;
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
 * Escape text for FFmpeg drawtext filter.
 * Inside single-quoted values, we need to escape: \ : ' [ ] %
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')       // \ → \\
    .replace(/'/g, "\u2019")       // ' → typographic apostrophe (safest)
    .replace(/:/g, '\\:')         // : → \:
    .replace(/%/g, '%%')          // % → %%
    .replace(/\[/g, '\\[')        // [ → \[
    .replace(/\]/g, '\\]')        // ] → \]
    .replace(/;/g, '\\;');        // ; → \;
}

function hexToFFmpeg(hex: string): string {
  const clean = hex.replace('#', '');
  return '0x' + clean.substring(0, 6);
}

/**
 * Build a chain of drawtext filters, one per subtitle segment.
 * Each filter is separated by comma (filter chain in FFmpeg).
 * We use the `enable` option with `between(t,start,end)` for timing.
 */
export function buildDrawtextFilter(options: BurnOptions, fontFile: string): string {
  const { segments, style, fontSize, position } = options;

  const yExpr = position === 'top'
    ? `${fontSize + 20}`
    : position === 'center'
    ? '(h-text_h)/2'
    : `h-${fontSize + 40}`;

  const filters = segments
    .filter(seg => seg.text.trim())
    .map(seg => {
      const startSec = (seg.fromMs / 1000).toFixed(3);
      const endSec = (seg.toMs / 1000).toFixed(3);
      const text = escapeDrawtext(seg.text);

      const parts: string[] = [
        `drawtext=fontfile=${fontFile}`,
        `text='${text}'`,
        `fontsize=${fontSize}`,
        `fontcolor=${hexToFFmpeg(style.fontColor)}`,
        `borderw=${style.borderW}`,
        `bordercolor=${hexToFFmpeg(style.borderColor)}`,
        `x=(w-text_w)/2`,
        `y=${yExpr}`,
        `enable='between(t\\,${startSec}\\,${endSec})'`,
      ];

      if (style.bgColor !== 'transparent') {
        parts.push(`box=1`, `boxcolor=${hexToFFmpeg(style.bgColor)}@0.7`, `boxborderw=8`);
      }

      return parts.join(':');
    });

  return filters.join(',');
}

/**
 * Load the font file into FFmpeg's virtual filesystem.
 */
async function loadFontIntoFS(ffmpeg: any): Promise<string> {
  try {
    const fontData = await fetchFile(FONT_PATH);
    await ffmpeg.writeFile(FONT_FS_NAME, fontData);
    console.log('[SubtitleBurner] Font loaded into FFmpeg FS:', FONT_FS_NAME);
    return FONT_FS_NAME;
  } catch (err) {
    console.warn('[SubtitleBurner] Failed to load font, drawtext may fail:', err);
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

  const inputName = `burn_input_${Date.now()}.mp4`;
  const outputName = `burned_${Date.now()}.mp4`;

  onProgress?.(8, 'Carregando fonte...');
  const fontFile = await loadFontIntoFS(ffmpeg);

  onProgress?.(10, 'Carregando vídeo...');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  const filterStr = buildDrawtextFilter(options, fontFile);
  console.log('[SubtitleBurner] drawtext filter (first 600 chars):', filterStr.substring(0, 600));

  // Track progress from FFmpeg logs
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
      onProgress?.(Math.round(pct), 'Gravando legendas no vídeo...');
    }
  };

  ffmpeg.on('log', logHandler);
  onProgress?.(20, 'Gravando legendas no vídeo...');

  let usedFallback = false;

  try {
    try {
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', filterStr,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y', outputName,
      ]);
    } catch (filterErr) {
      console.warn('[SubtitleBurner] drawtext failed, re-encoding without subtitles:', filterErr);
      usedFallback = true;
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'copy',
        '-movflags', '+faststart',
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
    console.error('[SubtitleBurner] Failed to read output:', readErr, 'Last error:', lastError);
    throw new Error('FFmpeg não produziu o arquivo de saída.');
  }

  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData as unknown as ArrayBuffer);

  if (outputBytes.length < 1000) {
    console.error('[SubtitleBurner] Output too small:', outputBytes.length, 'bytes. Last error:', lastError);
    throw new Error('Vídeo de saída está vazio ou corrompido.');
  }

  if (usedFallback) {
    console.warn('[SubtitleBurner] Used fallback - video re-encoded without subtitles');
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
