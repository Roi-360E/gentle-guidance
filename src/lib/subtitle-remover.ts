/**
 * Advanced Subtitle Remover — 100% local, no external APIs
 * 
 * Technique: Temporal Median Background Reconstruction
 * 
 * How it works:
 * 1. Extract N evenly-spaced frames from the video as images (FFmpeg)
 * 2. For the subtitle region only, compute the median pixel value across all samples
 *    — Since subtitles change between frames but the background stays mostly the same,
 *      the median naturally eliminates the text and reveals the true background
 * 3. Generate a "clean background plate" image from the median values
 * 4. Use FFmpeg to overlay this plate onto the subtitle region with soft edge blending
 * 
 * This produces much cleaner results than drawbox/blur for static or slow-moving backgrounds.
 * For fast-moving backgrounds, it gracefully degrades to a smooth averaged look.
 */

import { getFFmpeg } from './video-processor';
import { fetchFile } from '@ffmpeg/util';

const SAMPLE_COUNT = 24; // Number of frames to sample (more = better quality, slower)

/**
 * Extract evenly-spaced frames from a video as raw RGBA pixel data
 * Only extracts the subtitle region to save memory
 */
async function extractRegionFrames(
  ff: ReturnType<typeof getFFmpeg> extends Promise<infer T> ? T : never,
  inputName: string,
  width: number,
  height: number,
  regionY: number,
  regionH: number,
  sampleCount: number,
): Promise<Uint8Array[]> {
  // First, get video duration
  // We use a filter that outputs frames at fixed intervals
  const framesDir = 'sub_frames';

  // Extract sampled frames cropped to subtitle region only
  // fps=1/interval extracts frames at regular intervals
  // crop extracts only the subtitle region
  const exitCode = await ff.exec([
    '-i', inputName,
    '-vf', `fps=${sampleCount}/10,crop=${width}:${regionH}:0:${regionY},format=rgba`,
    '-frames:v', String(sampleCount),
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-y', 'region_frames.raw',
  ]);

  if (exitCode !== 0) {
    console.warn('[SubRemover] rawvideo extraction failed, trying PNG fallback...');
    return extractRegionFramesPNG(ff, inputName, width, height, regionY, regionH, sampleCount);
  }

  try {
    const rawData = await ff.readFile('region_frames.raw');
    const data = new Uint8Array(rawData as Uint8Array);
    const frameSize = width * regionH * 4; // RGBA = 4 bytes per pixel
    const frames: Uint8Array[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const offset = i * frameSize;
      if (offset + frameSize > data.length) break;
      frames.push(data.slice(offset, offset + frameSize));
    }

    try { await ff.deleteFile('region_frames.raw'); } catch {}
    console.log(`[SubRemover] Extracted ${frames.length} region frames (raw)`);
    return frames;
  } catch {
    return extractRegionFramesPNG(ff, inputName, width, height, regionY, regionH, sampleCount);
  }
}

/**
 * PNG-based frame extraction fallback (more compatible but slower)
 */
async function extractRegionFramesPNG(
  ff: ReturnType<typeof getFFmpeg> extends Promise<infer T> ? T : never,
  inputName: string,
  width: number,
  _height: number,
  regionY: number,
  regionH: number,
  sampleCount: number,
): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];

  // Extract individual PNG frames
  const exitCode = await ff.exec([
    '-i', inputName,
    '-vf', `fps=${sampleCount}/10,crop=${width}:${regionH}:0:${regionY}`,
    '-frames:v', String(sampleCount),
    '-y', 'frame_%03d.png',
  ]);

  if (exitCode !== 0) {
    console.warn('[SubRemover] PNG extraction also failed');
    return frames;
  }

  // Load each PNG into canvas to get RGBA pixel data
  for (let i = 1; i <= sampleCount; i++) {
    const filename = `frame_${String(i).padStart(3, '0')}.png`;
    try {
      const pngData = await ff.readFile(filename);
      const blob = new Blob([new Uint8Array(pngData as Uint8Array)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      frames.push(new Uint8Array(imageData.data.buffer));

      bitmap.close();
      try { await ff.deleteFile(filename); } catch {}
    } catch {
      break;
    }
  }

  console.log(`[SubRemover] Extracted ${frames.length} region frames (PNG)`);
  return frames;
}

/**
 * Compute temporal median for each pixel across multiple frames.
 * The median naturally eliminates transient elements (subtitles)
 * while preserving the persistent background.
 */
function computeTemporalMedian(frames: Uint8Array[], width: number, regionH: number): Uint8Array {
  const pixelCount = width * regionH;
  const result = new Uint8Array(pixelCount * 4);
  const numFrames = frames.length;

  if (numFrames === 0) return result;
  if (numFrames === 1) return new Uint8Array(frames[0]);

  // For each pixel position, collect values across all frames and take median
  const channelValues = new Uint8Array(numFrames);

  for (let px = 0; px < pixelCount; px++) {
    const baseIdx = px * 4;

    // Process each color channel (R, G, B, A) independently
    for (let ch = 0; ch < 4; ch++) {
      // Collect this channel's value from all frames
      for (let f = 0; f < numFrames; f++) {
        channelValues[f] = frames[f][baseIdx + ch] ?? 0;
      }

      // Sort to find median (in-place for speed)
      const sorted = channelValues.subarray(0, numFrames).sort();
      const mid = Math.floor(numFrames / 2);
      result[baseIdx + ch] = numFrames % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
    }
  }

  return result;
}

/**
 * Create a PNG image from raw RGBA pixel data
 */
async function rgbaToImageFile(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const clampedArr = new Uint8ClampedArray(rgba.length);
  clampedArr.set(rgba);
  const imageData = new ImageData(clampedArr, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * Main subtitle removal function using temporal median reconstruction.
 * 
 * @param file - Input video file
 * @param regionPct - Percentage of video height from bottom to clean (5-40%)
 * @param videoDimensions - Video dimensions
 * @param onProgress - Progress callback (0-100)
 * @returns Clean video file with subtitles removed
 */
export async function removeSubtitlesAdvanced(
  file: File,
  regionPct: number,
  videoDimensions: { width: number; height: number },
  onProgress?: (pct: number, status: string) => void,
): Promise<File> {
  const ff = await getFFmpeg();
  const ts = Date.now();
  const inputName = `sub_adv_in_${ts}.mp4`;
  const plateName = `sub_plate_${ts}.png`;
  const outputName = `sub_adv_out_${ts}.mp4`;

  onProgress?.(5, 'Carregando vídeo...');

  const data = await fetchFile(file);
  await ff.writeFile(inputName, new Uint8Array(data));

  const { width, height } = videoDimensions;
  const regionH = Math.round(height * (regionPct / 100));
  const regionY = height - regionH;
  // Soft edge blend zone (pixels) for seamless transition
  const blendH = Math.min(Math.round(regionH * 0.15), 20);

  console.log(`[SubRemover] Video: ${width}x${height}, Region: y=${regionY} h=${regionH}, Blend: ${blendH}px`);

  // ─── Strategy 1: FFmpeg tmedian filter (best quality) ───
  onProgress?.(10, 'Tentando remoção via mediana temporal...');
  
  // tmedian applied only to the subtitle region via split+overlay
  const tmedianFilter = [
    `split[orig][copy]`,
    `[copy]tmedian=radius=9,crop=${width}:${regionH}:0:${regionY}[cleaned]`,
    `[orig][cleaned]overlay=0:${regionY}`,
  ].join(';');

  let exitCode = await ff.exec([
    '-i', inputName,
    '-vf', tmedianFilter,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '20',
    '-c:a', 'copy',
    '-y', outputName,
  ]);

  if (exitCode === 0) {
    console.log('[SubRemover] ✅ tmedian filter succeeded!');
    onProgress?.(90, 'Finalizando...');
    try { await ff.deleteFile(inputName); } catch {}

    const outputData = await ff.readFile(outputName);
    try { await ff.deleteFile(outputName); } catch {}

    const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' });
    onProgress?.(100, 'Concluído!');
    return new File([blob], file.name, { type: 'video/mp4' });
  }

  console.warn('[SubRemover] tmedian not available, falling back to canvas temporal median...');

  // ─── Strategy 2: Canvas-based temporal median (universal fallback) ───
  onProgress?.(15, 'Extraindo frames de amostra...');

  const frames = await extractRegionFrames(ff, inputName, width, height, regionY, regionH, SAMPLE_COUNT);

  if (frames.length < 3) {
    console.warn(`[SubRemover] Only ${frames.length} frames extracted, falling back to drawbox`);
    // Final fallback: drawbox
    onProgress?.(50, 'Aplicando cobertura...');
    exitCode = await ff.exec([
      '-i', inputName,
      '-vf', `drawbox=x=0:y=${regionY}:w=${width}:h=${regionH}:color=black:t=fill`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-c:a', 'copy', '-y', outputName,
    ]);

    try { await ff.deleteFile(inputName); } catch {}
    if (exitCode !== 0) throw new Error(`Falha ao processar ${file.name}`);

    const outputData = await ff.readFile(outputName);
    try { await ff.deleteFile(outputName); } catch {}
    const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' });
    onProgress?.(100, 'Concluído (fallback)');
    return new File([blob], file.name, { type: 'video/mp4' });
  }

  onProgress?.(40, `Calculando mediana temporal (${frames.length} amostras)...`);

  // Compute the median background plate
  const actualW = frames[0].length / (regionH * 4) || width;
  const medianPixels = computeTemporalMedian(frames, Math.round(actualW), regionH);

  // Apply soft edge gradient: top rows of the plate fade to transparent
  // so the overlay blends seamlessly with the original video
  for (let row = 0; row < blendH; row++) {
    const alpha = row / blendH; // 0 (top, transparent) → 1 (fully opaque)
    for (let col = 0; col < Math.round(actualW); col++) {
      const idx = (row * Math.round(actualW) + col) * 4;
      medianPixels[idx + 3] = Math.round(medianPixels[idx + 3] * alpha);
    }
  }

  onProgress?.(60, 'Gerando placa de fundo limpa...');

  // Convert median data to PNG
  const plateBlob = await rgbaToImageFile(medianPixels, Math.round(actualW), regionH);
  const plateBuffer = await plateBlob.arrayBuffer();
  await ff.writeFile(plateName, new Uint8Array(plateBuffer));

  onProgress?.(70, 'Compositing vídeo final...');

  // Overlay the clean plate onto the subtitle region
  // The plate's built-in alpha gradient handles soft blending
  exitCode = await ff.exec([
    '-i', inputName,
    '-i', plateName,
    '-filter_complex', `[1:v]format=rgba[plate];[0:v][plate]overlay=0:${regionY}:format=auto`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '20',
    '-c:a', 'copy',
    '-y', outputName,
  ]);

  if (exitCode !== 0) {
    console.warn('[SubRemover] Overlay composite failed, trying drawbox final fallback...');
    exitCode = await ff.exec([
      '-i', inputName,
      '-vf', `drawbox=x=0:y=${regionY}:w=${width}:h=${regionH}:color=black:t=fill`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-c:a', 'copy', '-y', outputName,
    ]);
  }

  // Cleanup
  try { await ff.deleteFile(inputName); } catch {}
  try { await ff.deleteFile(plateName); } catch {}

  if (exitCode !== 0) throw new Error(`Falha ao remover legendas de ${file.name}`);

  const outputData = await ff.readFile(outputName);
  try { await ff.deleteFile(outputName); } catch {}

  const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' });
  onProgress?.(100, 'Concluído!');
  return new File([blob], file.name, { type: 'video/mp4' });
}
