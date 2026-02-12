import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

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
  preProcess: boolean; // compress inputs before concat
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
 * with optional resolution downscale for faster concat.
 */
async function preProcessInput(
  ff: FFmpeg,
  inputName: string,
  outputName: string,
  resolution: ResolutionPreset
): Promise<void> {
  const scale = resolutionMap[resolution];
  const args = ['-i', inputName];

  if (scale) {
    args.push('-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`);
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-r', '30',
    '-y',
    outputName
  );

  await ff.exec(args);
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ff = await getFFmpeg();

  const hookData = await fetchFile(combination.hook.file);
  const bodyData = await fetchFile(combination.body.file);
  const ctaData = await fetchFile(combination.cta.file);

  await ff.writeFile('hook_raw.mp4', hookData);
  await ff.writeFile('body_raw.mp4', bodyData);
  await ff.writeFile('cta_raw.mp4', ctaData);

  ff.on('progress', ({ progress }) => {
    onProgress?.(Math.min(Math.round(progress * 100), 100));
  });

  if (settings.preProcess) {
    // Pre-process: normalize all inputs to same resolution/codec
    onProgress?.(5);
    await preProcessInput(ff, 'hook_raw.mp4', 'hook.ts', settings.resolution);
    onProgress?.(25);
    await preProcessInput(ff, 'body_raw.mp4', 'body.ts', settings.resolution);
    onProgress?.(50);
    await preProcessInput(ff, 'cta_raw.mp4', 'cta.ts', settings.resolution);
    onProgress?.(70);

    const concatList = "file 'hook.ts'\nfile 'body.ts'\nfile 'cta.ts'\n";
    await ff.writeFile('concat.txt', concatList);

    await ff.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-y',
      'output.mp4',
    ]);
  } else {
    // Direct concat with optional re-encode for resolution
    const scale = resolutionMap[settings.resolution];

    if (scale) {
      // Must re-encode to match resolution
      await ff.exec([
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
        '-y',
        'output.mp4',
      ]);
    } else {
      const concatList = "file 'hook_raw.mp4'\nfile 'body_raw.mp4'\nfile 'cta_raw.mp4'\n";
      await ff.writeFile('concat.txt', concatList);
      await ff.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'output.mp4',
      ]);
    }
  }

  onProgress?.(95);

  const data = await ff.readFile('output.mp4');
  const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

  // Cleanup
  const filesToDelete = ['hook_raw.mp4', 'body_raw.mp4', 'cta_raw.mp4', 'hook.ts', 'body.ts', 'cta.ts', 'concat.txt', 'output.mp4'];
  for (const f of filesToDelete) {
    try { await ff.deleteFile(f); } catch {}
  }

  return URL.createObjectURL(blob);
}

/**
 * Process combinations in batches using an async queue.
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

    // Process one at a time (FFmpeg.wasm is single-threaded)
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
