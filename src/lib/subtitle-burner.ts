/**
 * Burn .ASS subtitles into video using FFmpeg.wasm
 */

import { getFFmpeg } from '@/lib/video-processor';
import { fetchFile } from '@ffmpeg/util';

export async function burnSubtitlesIntoVideo(
  videoFile: File,
  assContent: string,
  onProgress?: (pct: number, status: string) => void,
): Promise<Blob> {
  onProgress?.(5, 'Preparando FFmpeg...');
  const ffmpeg = await getFFmpeg();

  const inputName = `burn_input_${Date.now()}.mp4`;
  const assName = `subs_${Date.now()}.ass`;
  const outputName = `burned_${Date.now()}.mp4`;

  onProgress?.(10, 'Carregando vídeo...');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  onProgress?.(15, 'Carregando legendas...');
  const encoder = new TextEncoder();
  await ffmpeg.writeFile(assName, encoder.encode(assContent));

  // Track progress from FFmpeg logs
  let duration = 0;
  const logHandler = ({ message }: { message: string }) => {
    // Parse duration
    const durMatch = message.match(/Duration:\s+(\d+):(\d+):(\d+)/);
    if (durMatch) {
      duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    }
    // Parse time progress
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
    // Burn subtitles using the ASS filter
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', `ass=${assName}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
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
    await ffmpeg.deleteFile(assName);
    await ffmpeg.deleteFile(outputName);
  } catch { /* ignore */ }

  onProgress?.(100, 'Concluído!');
  return new Blob([new Uint8Array(outputBytes).buffer as ArrayBuffer], { type: 'video/mp4' });
}
