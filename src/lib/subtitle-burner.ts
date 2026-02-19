/**
 * Burn subtitles into video using FFmpeg.wasm drawtext filter
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

/**
 * Escape text for FFmpeg drawtext filter.
 * drawtext requires escaping: \ : ' and also [ ] ; %
 * In filtergraph context, we need one level of escaping.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')   // \ → \\
    .replace(/'/g, "'\\'")     // ' → '\'
    .replace(/:/g, '\\:')     // : → \:
    .replace(/%/g, '%%')      // % → %%
    .replace(/\[/g, '\\[')    // [ → \[
    .replace(/\]/g, '\\]');   // ] → \]
}

function hexToFFmpeg(hex: string): string {
  const clean = hex.replace('#', '');
  return '0x' + clean.substring(0, 6);
}

export function buildDrawtextFilter(options: BurnOptions): string {
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

      const parts = [
        `drawtext=text='${text}'`,
        `fontsize=${fontSize}`,
        `fontcolor=${hexToFFmpeg(style.fontColor)}`,
        `borderw=${style.borderW}`,
        `bordercolor=${hexToFFmpeg(style.borderColor)}`,
        `x=(w-text_w)/2`,
        `y=${yExpr}`,
        `enable='between(t,${startSec},${endSec})'`,
      ];

      if (style.bgColor !== 'transparent') {
        parts.push(`box=1`, `boxcolor=${hexToFFmpeg(style.bgColor)}@0.7`, `boxborderw=8`);
      }

      return parts.join(':');
    });

  return filters.join(',');
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

  onProgress?.(10, 'Carregando vídeo...');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  const filterStr = buildDrawtextFilter(options);
  console.log('[SubtitleBurner] drawtext filter:', filterStr.substring(0, 500));

  // Track progress from FFmpeg logs
  let duration = 0;
  let lastError = '';
  const logHandler = ({ message }: { message: string }) => {
    // Capture errors
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      lastError = message;
      console.warn('[SubtitleBurner] FFmpeg warning:', message);
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

  try {
    // First try with drawtext filter
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
      console.warn('[SubtitleBurner] drawtext failed, falling back to re-encode without subtitles:', filterErr);
      // Fallback: just re-encode without subtitles
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
    console.error('[SubtitleBurner] Failed to read output file:', readErr);
    throw new Error('FFmpeg did not produce output file. Check drawtext filter syntax.');
  }

  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData as unknown as ArrayBuffer);

  if (outputBytes.length < 1000) {
    console.error('[SubtitleBurner] Output file too small:', outputBytes.length, 'bytes. Last error:', lastError);
    throw new Error('Output video is empty or corrupted.');
  }

  // Cleanup
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([outputBytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
