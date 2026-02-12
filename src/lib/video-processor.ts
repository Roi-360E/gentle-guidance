import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;

  const instance = new FFmpeg();
  instance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const loadStrategies = [
    {
      name: 'Local JS + CDN WASM (jsdelivr)',
      coreJS: `${window.location.origin}/ffmpeg-core/ffmpeg-core.js`,
      wasm: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    },
    {
      name: 'Local JS + CDN WASM (unpkg)',
      coreJS: `${window.location.origin}/ffmpeg-core/ffmpeg-core.js`,
      wasm: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    },
    {
      name: 'Full CDN (jsdelivr)',
      coreJS: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
      wasm: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    },
    {
      name: 'Full CDN (unpkg)',
      coreJS: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
      wasm: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    },
  ];

  for (const strategy of loadStrategies) {
    try {
      console.log(`[VideoProcessor] Trying: ${strategy.name}...`);
      const coreURL = await toBlobURL(strategy.coreJS, 'text/javascript');
      const wasmURL = await toBlobURL(strategy.wasm, 'application/wasm');
      await instance.load({ coreURL, wasmURL });
      ffmpeg = instance;
      ffmpegLoaded = true;
      console.log(`[VideoProcessor] ✅ FFmpeg loaded via "${strategy.name}"`);
      return ffmpeg;
    } catch (err) {
      console.warn(`[VideoProcessor] Failed "${strategy.name}":`, err);
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

// ─── Pre-processing cache ───────────────────────────────────────────────
// Key = File object reference, Value = normalized filename in FFmpeg FS
const preProcessCache = new Map<File, string>();
let cacheCounter = 0;

function getCacheKey(file: File): string {
  return `norm_${cacheCounter++}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
}

/**
 * Pre-process a single input video with caching.
 * If the same File was already pre-processed, returns the cached filename instantly.
 */
async function preProcessInputCached(
  ff: FFmpeg,
  file: File,
  rawName: string,
  resolution: ResolutionPreset
): Promise<string> {
  const cached = preProcessCache.get(file);
  if (cached) {
    console.log(`[VideoProcessor] ⚡ Cache hit for "${file.name}" → ${cached}`);
    return cached;
  }

  const outputName = getCacheKey(file);
  
  // Write raw file
  const data = await fetchFile(file);
  await ff.writeFile(rawName, data);

  const scale = resolutionMap[resolution];
  console.log(`[VideoProcessor] Pre-processing ${file.name} → ${outputName} (resolution: ${resolution})`);

  const args: string[] = ['-i', rawName];
  if (scale) {
    args.push('-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`);
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

  let exitCode = await ff.exec(args);
  
  if (exitCode !== 0) {
    console.warn(`[VideoProcessor] Retrying ${file.name} without audio...`);
    const args2: string[] = ['-i', rawName];
    if (scale) {
      args2.push('-vf', `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`);
    }
    args2.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-r', '30', '-an', '-y', outputName);
    exitCode = await ff.exec(args2);
    if (exitCode !== 0) throw new Error(`Failed to pre-process ${file.name}`);
  }

  // Clean raw file to save memory
  try { await ff.deleteFile(rawName); } catch {}

  preProcessCache.set(file, outputName);
  console.log(`[VideoProcessor] ✅ Cached "${file.name}" as ${outputName}`);
  return outputName;
}

/**
 * Pre-process ALL unique input files upfront, before any concatenation.
 * This is the key optimization: each unique file is encoded only once.
 */
async function preProcessAllInputs(
  ff: FFmpeg,
  combinations: Combination[],
  settings: ProcessingSettings,
  onProgress?: (msg: string, pct: number) => void
): Promise<void> {
  // Collect unique files
  const uniqueFiles = new Set<File>();
  for (const c of combinations) {
    uniqueFiles.add(c.hook.file);
    uniqueFiles.add(c.body.file);
    uniqueFiles.add(c.cta.file);
  }

  const files = Array.from(uniqueFiles);
  console.log(`[VideoProcessor] 🔄 Pre-processing ${files.length} unique files (instead of ${combinations.length * 3} total)`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Normalizando ${i + 1}/${files.length}: ${file.name}`, Math.round(((i) / files.length) * 100));
    await preProcessInputCached(ff, file, `raw_input_${i}.mp4`, settings.resolution);
  }

  onProgress?.('Pré-processamento concluído', 100);
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ff = await getFFmpeg();
  console.log(`[VideoProcessor] Concatenating combo ${combination.id}: ${combination.outputName}`);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.round(progress * 100), 100));
  };
  ff.on('progress', progressHandler);

  try {
    if (settings.preProcess) {
      // Files should already be cached from preProcessAllInputs
      const hookNorm = preProcessCache.get(combination.hook.file);
      const bodyNorm = preProcessCache.get(combination.body.file);
      const ctaNorm = preProcessCache.get(combination.cta.file);

      if (!hookNorm || !bodyNorm || !ctaNorm) {
        throw new Error(`Cache miss for combo ${combination.id} — files not pre-processed`);
      }

      // Concat demuxer (fastest — just copies streams)
      const outputFile = `out_${combination.id}.mp4`;
      const concatList = `file '${hookNorm}'\nfile '${bodyNorm}'\nfile '${ctaNorm}'\n`;
      await ff.writeFile('concat.txt', concatList);

      let exitCode = await ff.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', '-movflags', '+faststart', '-y', outputFile,
      ]);

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Concat demuxer failed, trying filter concat...');
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
          '-y', outputFile,
        ]);
      }

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Audio concat failed, trying video-only...');
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
          '-map', '[outv]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-an',
          '-y', outputFile,
        ]);
      }

      if (exitCode !== 0) throw new Error(`All concat methods failed for combo ${combination.id}`);

      const data = await ff.readFile(outputFile);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      try { await ff.deleteFile(outputFile); } catch {}
      try { await ff.deleteFile('concat.txt'); } catch {}

      console.log(`[VideoProcessor] Combo ${combination.id} done! Size: ${blob.size}B`);
      return URL.createObjectURL(blob);

    } else {
      // Direct concat (no pre-processing)
      const hookData = await fetchFile(combination.hook.file);
      const bodyData = await fetchFile(combination.body.file);
      const ctaData = await fetchFile(combination.cta.file);
      await ff.writeFile('hook_raw.mp4', hookData);
      await ff.writeFile('body_raw.mp4', bodyData);
      await ff.writeFile('cta_raw.mp4', ctaData);

      const scale = resolutionMap[settings.resolution];
      const outputFile = 'output.mp4';
      let exitCode: number;

      if (scale) {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
          '-filter_complex',
          `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];` +
          `[1:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];` +
          `[2:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];` +
          `[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[outv][outa]`,
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
          '-y', outputFile,
        ]);
      } else {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
          '-y', outputFile,
        ]);
      }

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Direct concat failed, trying video-only...');
        if (scale) {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
            '-filter_complex',
            `[0:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];` +
            `[1:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];` +
            `[2:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];` +
            `[v0][v1][v2]concat=n=3:v=1:a=0[outv]`,
            '-map', '[outv]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-an',
            '-y', outputFile,
          ]);
        } else {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
            '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
            '-map', '[outv]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-an',
            '-y', outputFile,
          ]);
        }
      }

      if (exitCode !== 0) throw new Error(`Concatenation failed for combo ${combination.id}`);

      const data = await ff.readFile(outputFile);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

      for (const f of ['hook_raw.mp4', 'body_raw.mp4', 'cta_raw.mp4', outputFile]) {
        try { await ff.deleteFile(f); } catch {}
      }

      return URL.createObjectURL(blob);
    }
  } finally {
    ff.off('progress', progressHandler);
  }
}

/**
 * Clear the pre-processing cache and free FFmpeg FS memory.
 */
async function clearCache(): Promise<void> {
  if (!ffmpeg) return;
  for (const [, filename] of preProcessCache) {
    try { await ffmpeg.deleteFile(filename); } catch {}
  }
  preProcessCache.clear();
  cacheCounter = 0;
  console.log('[VideoProcessor] Cache cleared');
}

/**
 * Process combinations with optimized pipeline:
 * 1. Pre-process all unique files once (cached)
 * 2. Concatenate each combo using cached files (concat demuxer = near-instant)
 */
export async function processQueue(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  console.log(`[VideoProcessor] Starting queue: ${combinations.length} combinations`);

  const ff = await getFFmpeg();

  // Phase 1: Pre-process all unique inputs (the expensive part, done only once)
  if (settings.preProcess) {
    console.log('[VideoProcessor] ═══ Phase 1: Pre-processing unique files ═══');
    await preProcessAllInputs(ff, combinations, settings, (msg, pct) => {
      console.log(`[VideoProcessor] ${msg} (${pct}%)`);
    });
  }

  // Phase 2: Concatenate each combo (fast when using cached pre-processed files)
  console.log('[VideoProcessor] ═══ Phase 2: Concatenating combinations ═══');
  const queue = [...combinations];

  while (queue.length > 0) {
    if (abortSignal?.aborted) break;

    const combo = queue.shift()!;
    combo.status = 'processing';
    onUpdate([...combinations]);

    try {
      const url = await concatenateVideos(combo, settings, onProgressItem);
      if (!url) throw new Error('URL de saída vazia');
      combo.status = 'done';
      combo.outputUrl = url;
      console.log(`%c[VideoProcessor] ✅ Combo ${combo.id} (${combo.outputName}) concluído!`, 'color: #22c55e; font-weight: bold;');
    } catch (err) {
      combo.status = 'error';
      const errorMsg = err instanceof Error ? err.message : String(err);
      combo.errorMessage = errorMsg;
      console.error(`%c[VideoProcessor] ❌ ERRO no combo ${combo.id} (${combo.outputName}):`, 'color: #ef4444; font-weight: bold;', errorMsg);
      console.error(`[VideoProcessor] Detalhes:`, err);
    }

    onUpdate([...combinations]);
    onProgressItem(0);
  }

  // Cleanup cache after all done
  await clearCache();

  console.log(`[VideoProcessor] Queue complete. Done: ${combinations.filter(c => c.status === 'done').length}, Errors: ${combinations.filter(c => c.status === 'error').length}`);
}
