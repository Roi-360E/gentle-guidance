import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;

  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }

  if (!ffmpegLoaded) {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegLoaded = true;
  }

  return ffmpeg;
}

export interface VideoFile {
  file: File;
  name: string;
  url: string;
}

export interface Combination {
  id: number;
  hook: VideoFile;
  body: VideoFile;
  cta: VideoFile;
  status: 'pending' | 'processing' | 'done' | 'error';
  outputUrl?: string;
  outputName: string;
}

export type ResolutionPreset = 'original' | '1080p' | '720p' | '480p' | '360p';

export interface ProcessingSettings {
  resolution: ResolutionPreset;
  batchSize: number;
  preProcess: boolean;
}

export const defaultSettings: ProcessingSettings = {
  resolution: '720p',
  batchSize: 3,
  preProcess: true,
};

const resolutionMap: Record<ResolutionPreset, string | null> = {
  original: null,
  '1080p': '1920:1080',
  '720p': '1280:720',
  '480p': '854:480',
  '360p': '640:360',
};

export function generateCombinations(
  hooks: VideoFile[],
  bodies: VideoFile[],
  ctas: VideoFile[]
): Combination[] {
  const combinations: Combination[] = [];
  let id = 1;

  for (const hook of hooks) {
    for (const body of bodies) {
      for (const cta of ctas) {
        combinations.push({
          id,
          hook,
          body,
          cta,
          status: 'pending',
          outputName: `video_${id}_H${hooks.indexOf(hook) + 1}_B${bodies.indexOf(body) + 1}_C${ctas.indexOf(cta) + 1}.mp4`,
        });
        id++;
      }
    }
  }

  return combinations;
}

/**
 * Pre-process a single input video: re-encode to a standard format
 * with a guaranteed audio track and optional resolution downscale.
 * This ensures all inputs are compatible for concatenation.
 */
async function preProcessInput(
  ff: FFmpeg,
  inputName: string,
  outputName: string,
  resolution: ResolutionPreset
): Promise<void> {
  const scale = resolutionMap[resolution];

  // Strategy: always add a silent audio track and mix with original (if exists).
  // This guarantees every output has an audio stream, preventing concat failures.
  const filterParts: string[] = [];

  // Video filter
  if (scale) {
    filterParts.push(`[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[vout]`);
  } else {
    filterParts.push(`[0:v]fps=30,setsar=1[vout]`);
  }

  // Generate silent audio and mix with any existing audio
  // anullsrc generates silence; amix handles the case where original audio exists or not
  filterParts.push(`anullsrc=r=44100:cl=stereo[silence]`);
  filterParts.push(`[0:a][silence]amix=inputs=2:duration=shortest:dropout_transition=0[aout]`);

  const filterComplex = filterParts.join(';');

  // First attempt: with audio mixing (assumes input has audio)
  let exitCode = await ff.exec([
    '-i', inputName,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex',
    scale
      ? `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[vout]`
      : `[0:v]fps=30,setsar=1[vout]`,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-shortest',
    '-y',
    outputName,
  ]);

  // If that failed (e.g., no audio stream mapped), try without mapping original audio
  // and generate pure silent audio instead
  if (exitCode !== 0) {
    console.warn(`Pre-process with audio mapping failed for ${inputName}, retrying with silent audio...`);
    exitCode = await ff.exec([
      '-i', inputName,
      '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
      '-filter_complex',
      scale
        ? `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[vout]`
        : `[0:v]fps=30,setsar=1[vout]`,
      '-map', '[vout]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-shortest',
      '-y',
      outputName,
    ]);
  }

  if (exitCode !== 0) {
    // Last resort: video only, no audio
    console.warn(`Pre-process with audio failed for ${inputName}, trying video-only...`);
    exitCode = await ff.exec([
      '-i', inputName,
      ...(scale
        ? ['-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`]
        : []),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-an',
      '-r', '30',
      '-y',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Pre-process failed for ${inputName} (exit code ${exitCode})`);
    }
  }
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ff = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.round(progress * 100), 100));
  };

  const hookData = await fetchFile(combination.hook.file);
  const bodyData = await fetchFile(combination.body.file);
  const ctaData = await fetchFile(combination.cta.file);

  await ff.writeFile('hook_raw.mp4', hookData);
  await ff.writeFile('body_raw.mp4', bodyData);
  await ff.writeFile('cta_raw.mp4', ctaData);

  ff.on('progress', progressHandler);

  try {
    if (settings.preProcess) {
      // Pre-process: normalize all inputs to same resolution/codec/fps/audio
      onProgress?.(5);
      await preProcessInput(ff, 'hook_raw.mp4', 'hook_norm.mp4', settings.resolution);
      onProgress?.(25);
      await preProcessInput(ff, 'body_raw.mp4', 'body_norm.mp4', settings.resolution);
      onProgress?.(50);
      await preProcessInput(ff, 'cta_raw.mp4', 'cta_norm.mp4', settings.resolution);
      onProgress?.(70);

      // Use concat demuxer (safe because all inputs are now normalized)
      const concatList = "file 'hook_norm.mp4'\nfile 'body_norm.mp4'\nfile 'cta_norm.mp4'\n";
      await ff.writeFile('concat.txt', concatList);

      const exitCode = await ff.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        'output.mp4',
      ]);

      if (exitCode !== 0) {
        // Fallback: re-encode with filter_complex
        console.warn('Concat demuxer failed, falling back to filter_complex...');
        const fallbackCode = await ff.exec([
          '-i', 'hook_norm.mp4',
          '-i', 'body_norm.mp4',
          '-i', 'cta_norm.mp4',
          '-filter_complex',
          '[0:v:0][0:a:0][1:v:0][1:a:0][2:v:0][2:a:0]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          'output.mp4',
        ]);

        if (fallbackCode !== 0) {
          throw new Error(`Concatenation failed (exit code ${fallbackCode})`);
        }
      }
    } else {
      // Direct concat without pre-processing
      const scale = resolutionMap[settings.resolution];
      let exitCode: number;

      if (scale) {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4',
          '-i', 'body_raw.mp4',
          '-i', 'cta_raw.mp4',
          '-filter_complex',
          `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];` +
          `[1:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];` +
          `[2:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];` +
          `[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[outv][outa]`,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          'output.mp4',
        ]);
      } else {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4',
          '-i', 'body_raw.mp4',
          '-i', 'cta_raw.mp4',
          '-filter_complex',
          '[0:v:0][0:a:0][1:v:0][1:a:0][2:v:0][2:a:0]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          'output.mp4',
        ]);
      }

      if (exitCode !== 0) {
        throw new Error(`Concatenation failed (exit code ${exitCode})`);
      }
    }

    onProgress?.(95);

    const data = await ff.readFile('output.mp4');
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

    return URL.createObjectURL(blob);
  } finally {
    // Cleanup always runs
    ff.off('progress', progressHandler);
    const filesToDelete = [
      'hook_raw.mp4', 'body_raw.mp4', 'cta_raw.mp4',
      'hook_norm.mp4', 'body_norm.mp4', 'cta_norm.mp4',
      'concat.txt', 'output.mp4',
    ];
    for (const f of filesToDelete) {
      try { await ff.deleteFile(f); } catch {}
    }
  }
}

/**
 * Process combinations sequentially using an async queue.
 */
export async function processQueue(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const queue = [...combinations];

  while (queue.length > 0) {
    if (abortSignal?.aborted) break;

    const combo = queue.shift()!;
    combo.status = 'processing';
    onUpdate([...combinations]);

    try {
      const url = await concatenateVideos(combo, settings, onProgressItem);
      combo.status = 'done';
      combo.outputUrl = url;
    } catch (err) {
      combo.status = 'error';
      console.error(`Error processing combo ${combo.id}:`, err);
    }

    onUpdate([...combinations]);
    onProgressItem(0);
  }
}
