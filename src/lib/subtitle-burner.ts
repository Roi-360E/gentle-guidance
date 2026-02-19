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

function escapeDrawtext(text: string): string {
  // Escape special characters for FFmpeg drawtext
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/;/g, '\\\\;')
    .replace(/%/g, '%%')
    .replace(/\[/g, '\\\\[')
    .replace(/\]/g, '\\\\]');
}

function hexToFFmpeg(hex: string): string {
  // FFmpeg uses 0xRRGGBB format, handle hex with or without #
  const clean = hex.replace('#', '');
  // Take only first 6 chars (ignore alpha)
  return '0x' + clean.substring(0, 6);
}

export function buildDrawtextFilter(options: BurnOptions): string {
  const { segments, style, fontSize, position } = options;

  // Y position calculation
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

      let filter = `drawtext=text='${text}'`;
      filter += `:fontsize=${fontSize}`;
      filter += `:fontcolor=${hexToFFmpeg(style.fontColor)}`;
      filter += `:borderw=${style.borderW}`;
      filter += `:bordercolor=${hexToFFmpeg(style.borderColor)}`;
      filter += `:x=(w-text_w)/2`;
      filter += `:y=${yExpr}`;
      filter += `:enable='between(t\\,${startSec}\\,${endSec})'`;

      if (style.bgColor !== 'transparent') {
        filter += `:box=1:boxcolor=${hexToFFmpeg(style.bgColor)}@0.7:boxborderw=8`;
      }

      return filter;
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

  // Track progress from FFmpeg logs
  let duration = 0;
  const logHandler = ({ message }: { message: string }) => {
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
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', filterStr,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '30',
      '-c:a', 'copy',
      '-y', outputName,
    ]);
  } finally {
    ffmpeg.off('log', logHandler);
  }

  onProgress?.(95, 'Finalizando...');
  const outputData = await ffmpeg.readFile(outputName);
  const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData as unknown as ArrayBuffer);

  // Cleanup
  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([new Uint8Array(outputBytes).buffer as ArrayBuffer], { type: 'video/mp4' });
}
