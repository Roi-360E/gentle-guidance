import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;

  // Check for cross-origin isolation (required for SharedArrayBuffer)
  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
    console.warn('[VideoProcessor] crossOriginIsolated is false. SharedArrayBuffer may not be available.');
  }

  const instance = new FFmpeg();
  instance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  // Use ESM format for Vite, version 0.12.10 to match @ffmpeg/ffmpeg@0.12.10
  const CDN_BASES = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm',
    'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm',
  ];

  for (const baseURL of CDN_BASES) {
    try {
      console.log(`[VideoProcessor] Loading FFmpeg from ${baseURL}...`);

      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

      await instance.load({ coreURL, wasmURL });

      ffmpeg = instance;
      ffmpegLoaded = true;
      console.log('[VideoProcessor] ✅ FFmpeg loaded successfully');
      return ffmpeg;
    } catch (err) {
      console.warn(`[VideoProcessor] Failed to load from ${baseURL}:`, err);
    }
  }

  ffmpeg = null;
  ffmpegLoaded = false;
  throw new Error('Falha ao carregar FFmpeg. Verifique sua conexão com a internet e tente novamente.');
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
  errorMessage?: string;
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
 * Pre-process a single input video: re-encode to normalized format.
 * Uses simplest possible FFmpeg commands for maximum compatibility with FFmpeg.wasm.
 */
async function preProcessInput(
  ff: FFmpeg,
  inputName: string,
  outputName: string,
  resolution: ResolutionPreset
): Promise<void> {
  const scale = resolutionMap[resolution];
  console.log(`[VideoProcessor] Pre-processing ${inputName} → ${outputName} (resolution: ${resolution})`);

  // Simple re-encode with standard settings
  // The key: we always include -c:a aac so if audio exists it gets normalized,
  // and if it doesn't exist FFmpeg just ignores the audio codec setting.
  const args: string[] = ['-i', inputName];

  if (scale) {
    args.push(
      '-vf',
      `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`
    );
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-y',
    outputName
  );

  const exitCode = await ff.exec(args);
  console.log(`[VideoProcessor] Pre-process ${inputName} exit code: ${exitCode}`);

  if (exitCode !== 0) {
    // Fallback: try video-only (input might have no audio at all)
    console.warn(`[VideoProcessor] Retrying ${inputName} without audio...`);
    const args2: string[] = ['-i', inputName];
    if (scale) {
      args2.push(
        '-vf',
        `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`
      );
    }
    args2.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-r', '30',
      '-an',
      '-y',
      outputName
    );

    const exitCode2 = await ff.exec(args2);
    console.log(`[VideoProcessor] Video-only pre-process ${inputName} exit code: ${exitCode2}`);

    if (exitCode2 !== 0) {
      throw new Error(`Failed to pre-process ${inputName}`);
    }
  }
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ff = await getFFmpeg();
  console.log(`[VideoProcessor] Starting concatenation for combo ${combination.id}: ${combination.outputName}`);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.round(progress * 100), 100));
  };

  ff.on('progress', progressHandler);

  try {
    // Write input files
    const hookData = await fetchFile(combination.hook.file);
    const bodyData = await fetchFile(combination.body.file);
    const ctaData = await fetchFile(combination.cta.file);

    await ff.writeFile('hook_raw.mp4', hookData);
    await ff.writeFile('body_raw.mp4', bodyData);
    await ff.writeFile('cta_raw.mp4', ctaData);
    console.log(`[VideoProcessor] Input files written (hook: ${combination.hook.file.size}B, body: ${combination.body.file.size}B, cta: ${combination.cta.file.size}B)`);

    if (settings.preProcess) {
      // Step 1: Pre-process each input
      onProgress?.(5);
      await preProcessInput(ff, 'hook_raw.mp4', 'hook_norm.mp4', settings.resolution);
      onProgress?.(25);
      await preProcessInput(ff, 'body_raw.mp4', 'body_norm.mp4', settings.resolution);
      onProgress?.(50);
      await preProcessInput(ff, 'cta_raw.mp4', 'cta_norm.mp4', settings.resolution);
      onProgress?.(70);

      // Step 2: Concatenate using concat demuxer (fastest, works when streams match)
      console.log('[VideoProcessor] Attempting concat demuxer...');
      const concatList = "file 'hook_norm.mp4'\nfile 'body_norm.mp4'\nfile 'cta_norm.mp4'\n";
      await ff.writeFile('concat.txt', concatList);

      let exitCode = await ff.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        'output.mp4',
      ]);
      console.log(`[VideoProcessor] Concat demuxer exit code: ${exitCode}`);

      // Fallback: if concat demuxer fails, re-encode everything together
      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Concat demuxer failed, trying re-encode concat...');

        // Try with video+audio
        exitCode = await ff.exec([
          '-i', 'hook_norm.mp4',
          '-i', 'body_norm.mp4',
          '-i', 'cta_norm.mp4',
          '-filter_complex',
          '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-y',
          'output.mp4',
        ]);
        console.log(`[VideoProcessor] Filter concat (v+a) exit code: ${exitCode}`);
      }

      // Fallback 2: video-only concat
      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Audio concat failed, trying video-only...');
        exitCode = await ff.exec([
          '-i', 'hook_norm.mp4',
          '-i', 'body_norm.mp4',
          '-i', 'cta_norm.mp4',
          '-filter_complex',
          '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
          '-map', '[outv]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-an',
          '-y',
          'output.mp4',
        ]);
        console.log(`[VideoProcessor] Filter concat (v-only) exit code: ${exitCode}`);
      }

      if (exitCode !== 0) {
        throw new Error(`All concatenation methods failed for combo ${combination.id}`);
      }
    } else {
      // Direct concat without pre-processing
      const scale = resolutionMap[settings.resolution];
      console.log(`[VideoProcessor] Direct concat (scale: ${scale || 'none'})`);

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
          '-crf', '28',
          '-c:a', 'aac',
          '-y',
          'output.mp4',
        ]);
      } else {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4',
          '-i', 'body_raw.mp4',
          '-i', 'cta_raw.mp4',
          '-filter_complex',
          '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-y',
          'output.mp4',
        ]);
      }

      // Fallback: video-only
      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Direct concat failed, trying video-only...');
        if (scale) {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4',
            '-i', 'body_raw.mp4',
            '-i', 'cta_raw.mp4',
            '-filter_complex',
            `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];` +
            `[1:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];` +
            `[2:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];` +
            `[v0][v1][v2]concat=n=3:v=1:a=0[outv]`,
            '-map', '[outv]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-an',
            '-y',
            'output.mp4',
          ]);
        } else {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4',
            '-i', 'body_raw.mp4',
            '-i', 'cta_raw.mp4',
            '-filter_complex',
            '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
            '-map', '[outv]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-an',
            '-y',
            'output.mp4',
          ]);
        }
      }

      if (exitCode !== 0) {
        throw new Error(`Concatenation failed for combo ${combination.id}`);
      }
    }

    onProgress?.(95);

    const data = await ff.readFile('output.mp4');
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
    console.log(`[VideoProcessor] Combo ${combination.id} completed! Output size: ${blob.size}B`);

    return URL.createObjectURL(blob);
  } finally {
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
 * Process combinations sequentially.
 */
export async function processQueue(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  console.log(`[VideoProcessor] Starting queue: ${combinations.length} combinations`);
  const queue = [...combinations];

  while (queue.length > 0) {
    if (abortSignal?.aborted) break;

    const combo = queue.shift()!;
    combo.status = 'processing';
    onUpdate([...combinations]);

    try {
      const url = await concatenateVideos(combo, settings, onProgressItem);
      if (!url) {
        throw new Error('URL de saída vazia');
      }
      combo.status = 'done';
      combo.outputUrl = url;
      console.log(`%c[VideoProcessor] ✅ Combo ${combo.id} (${combo.outputName}) concluído com sucesso!`, 'color: #22c55e; font-weight: bold;');
    } catch (err) {
      combo.status = 'error';
      const errorMsg = err instanceof Error ? err.message : String(err);
      combo.errorMessage = errorMsg;
      console.error(`%c[VideoProcessor] ❌ ERRO no combo ${combo.id} (${combo.outputName}):`, 'color: #ef4444; font-weight: bold;', errorMsg);
      console.error(`[VideoProcessor] Detalhes do erro:`, err);
      console.error(`[VideoProcessor] Arquivos de entrada: Hook=${combo.hook.name} (${combo.hook.file.size}B), Body=${combo.body.name} (${combo.body.file.size}B), CTA=${combo.cta.name} (${combo.cta.file.size}B)`);
    }

    onUpdate([...combinations]);
    onProgressItem(0);
  }

  console.log(`[VideoProcessor] Queue complete. Done: ${combinations.filter(c => c.status === 'done').length}, Errors: ${combinations.filter(c => c.status === 'error').length}`);
}
