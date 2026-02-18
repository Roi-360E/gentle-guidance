import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
let processedSinceRestart = 0;
const RESTART_EVERY = 50;

// ─── fetchFile cache (avoids re-reading the same source file multiple times) ──
const fetchFileCache = new Map<File, Uint8Array>();

async function fetchFileCached(file: File): Promise<Uint8Array> {
  const cached = fetchFileCache.get(file);
  if (cached) return cached;
  const data = await fetchFile(file);
  const arr = new Uint8Array(data);
  fetchFileCache.set(file, arr);
  return arr;
}

function clearFetchFileCache(): void {
  fetchFileCache.clear();
}

const CORE_VERSION = '0.12.10';
const CDN_BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
];

async function toBlobURLWithTimeout(url: string, mimeType: string, timeoutMs = 30000): Promise<string> {
  return Promise.race([
    toBlobURL(url, mimeType),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout loading ${url}`)), timeoutMs)
    ),
  ]);
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpegLoaded) return ffmpeg;

  const instance = new FFmpeg();
  instance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
    console.info('[VideoProcessor] ℹ️ Running in single-thread mode (crossOriginIsolated=false). This is normal.');
  }

  for (const base of CDN_BASES) {
    try {
      console.log(`[VideoProcessor] Trying CDN: ${base}...`);
      const coreURL = await toBlobURLWithTimeout(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURLWithTimeout(`${base}/ffmpeg-core.wasm`, 'application/wasm');
      await instance.load({ coreURL, wasmURL });
      ffmpeg = instance;
      ffmpegLoaded = true;
      console.log(`[VideoProcessor] ✅ FFmpeg loaded successfully from ${base}`);
      return ffmpeg;
    } catch (err) {
      console.warn(`[VideoProcessor] ❌ Failed from ${base}:`, err);
    }
  }

  throw new Error('Falha ao carregar FFmpeg. Verifique sua conexão com a internet e tente novamente.');
}

/** Force-terminate the current FFmpeg instance (used for cancel & memory recycling) */
export async function terminateFFmpeg(): Promise<void> {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch {}
    ffmpeg = null;
    ffmpegLoaded = false;
    processedSinceRestart = 0;
    preProcessCache.clear();
    cacheCounter = 0;
    clearFetchFileCache();
    console.log('[VideoProcessor] 🔴 FFmpeg terminated');
  }
}

/** Recycle FFmpeg instance to free memory (every N videos) */
async function maybeRecycleFFmpeg(): Promise<FFmpeg> {
  processedSinceRestart++;
  if (processedSinceRestart >= RESTART_EVERY) {
    console.log(`[VideoProcessor] ♻️ Recycling FFmpeg after ${processedSinceRestart} videos`);
    await terminateFFmpeg();
  }
  return getFFmpeg();
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
export type VideoFormat = '9:16' | '16:9' | '1:1';

export interface ProcessingSettings {
  resolution: ResolutionPreset;
  batchSize: number;
  preProcess: boolean;
  useCloud?: boolean;
  videoFormat: VideoFormat;
}

export const defaultSettings: ProcessingSettings = {
  resolution: '720p',
  batchSize: 3,
  preProcess: true,
  videoFormat: '9:16',
};

// Resolution map keyed by format then resolution preset → "width:height"
const formatResolutionMap: Record<VideoFormat, Record<ResolutionPreset, string | null>> = {
  '16:9': {
    original: null,
    '1080p': '1920:1080',
    '720p': '1280:720',
    '480p': '854:480',
    '360p': '640:360',
  },
  '9:16': {
    original: null,
    '1080p': '1080:1920',
    '720p': '720:1280',
    '480p': '480:854',
    '360p': '360:640',
  },
  '1:1': {
    original: null,
    '1080p': '1080:1080',
    '720p': '720:720',
    '480p': '480:480',
    '360p': '360:360',
  },
};

function getScale(settings: ProcessingSettings): string | null {
  const format = settings.videoFormat || '9:16';
  return formatResolutionMap[format]?.[settings.resolution] ?? null;
}

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

// ─── Abort helper ───────────────────────────────────────────────────────
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

// ─── Pre-processing cache ───────────────────────────────────────────────
const preProcessCache = new Map<File, string>();
let cacheCounter = 0;

function getCacheKey(file: File): string {
  return `norm_${cacheCounter++}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
}

export async function preProcessInputCached(
  ff: FFmpeg,
  file: File,
  rawName: string,
  settings: ProcessingSettings,
  abortSignal?: AbortSignal
): Promise<string> {
  const cached = preProcessCache.get(file);
  if (cached) {
    console.log(`[VideoProcessor] ⚡ Cache hit for "${file.name}" → ${cached}`);
    return cached;
  }

  checkAbort(abortSignal);

  const outputName = getCacheKey(file);
  const data = await fetchFileCached(file);
  await ff.writeFile(rawName, data);

  const scale = getScale(settings);
  const startTime = performance.now();
  console.log(`[VideoProcessor] Pre-processing ${file.name} → ${outputName} (resolution: ${settings.resolution}, format: ${settings.videoFormat})`);

  // ─── FAST PATH: stream copy (remux only, ~0.1-0.3s) ───
  // Try stream copy first — no re-encoding, just repackage container
  if (!scale || settings.resolution === 'original') {
    const copyArgs = ['-i', rawName, '-c', 'copy', '-movflags', '+faststart', '-y', outputName];
    let exitCode = await ff.exec(copyArgs);
    checkAbort(abortSignal);

    if (exitCode === 0) {
      try { await ff.deleteFile(rawName); } catch {}
      preProcessCache.set(file, outputName);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`[VideoProcessor] ⚡ Stream copy OK for "${file.name}" in ${elapsed}s`);
      return outputName;
    }
    console.warn(`[VideoProcessor] Stream copy failed for ${file.name}, falling back to re-encode...`);
  }

  // ─── FALLBACK: ultrafast re-encode ───
  const args: string[] = ['-i', rawName];
  if (scale) {
    args.push('-vf', `scale=${scale}`);
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'fastdecode',
    '-crf', '30',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-y',
    outputName
  );

  let exitCode = await ff.exec(args);
  checkAbort(abortSignal);

  if (exitCode !== 0) {
    console.warn(`[VideoProcessor] Retrying ${file.name} without audio...`);
    const args2: string[] = ['-i', rawName];
    if (scale) {
      args2.push('-vf', `scale=${scale}`);
    }
    args2.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-r', '30', '-an', '-y', outputName);
    exitCode = await ff.exec(args2);
    checkAbort(abortSignal);
    if (exitCode !== 0) throw new Error(`Failed to pre-process ${file.name}`);
  }

  try { await ff.deleteFile(rawName); } catch {}

  preProcessCache.set(file, outputName);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`[VideoProcessor] ✅ Cached "${file.name}" as ${outputName} in ${elapsed}s`);
  return outputName;
}

async function preProcessAllInputs(
  ff: FFmpeg,
  combinations: Combination[],
  settings: ProcessingSettings,
  onProgress?: (msg: string, pct: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const uniqueFiles = new Set<File>();
  for (const c of combinations) {
    uniqueFiles.add(c.hook.file);
    uniqueFiles.add(c.body.file);
    uniqueFiles.add(c.cta.file);
  }

  const files = Array.from(uniqueFiles);
  console.log(`[VideoProcessor] 🔄 Pre-processing ${files.length} unique files`);

  for (let i = 0; i < files.length; i++) {
    checkAbort(abortSignal);
    const file = files[i];
    onProgress?.(`Normalizando ${i + 1}/${files.length}: ${file.name}`, Math.round((i / files.length) * 100));
    await preProcessInputCached(ff, file, `raw_input_${i}.mp4`, settings, abortSignal);
  }

  onProgress?.('Pré-processamento concluído', 100);
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const ff = await getFFmpeg();
  checkAbort(abortSignal);
  console.log(`[VideoProcessor] Concatenating combo ${combination.id}: ${combination.outputName}`);

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(Math.round(progress * 100), 100);
    if (pct > 0) onProgress?.(pct);
  };

  let lastLogProgress = 0;
  const logHandler = ({ message }: { message: string }) => {
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch) {
      lastLogProgress = Math.min(lastLogProgress + 5, 90);
      onProgress?.(lastLogProgress);
    }
  };

  ff.on('progress', progressHandler);
  ff.on('log', logHandler);

  try {
    if (settings.preProcess) {
      const hookNorm = preProcessCache.get(combination.hook.file);
      const bodyNorm = preProcessCache.get(combination.body.file);
      const ctaNorm = preProcessCache.get(combination.cta.file);

      if (!hookNorm || !bodyNorm || !ctaNorm) {
        throw new Error(`Cache miss for combo ${combination.id}`);
      }

      const outputFile = `out_${combination.id}.mp4`;
      const concatList = `file '${hookNorm}'\nfile '${bodyNorm}'\nfile '${ctaNorm}'\n`;
      await ff.writeFile('concat.txt', concatList);

      let exitCode = await ff.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', '-movflags', '+faststart', '-y', outputFile,
      ]);
      checkAbort(abortSignal);

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Concat demuxer failed, trying filter concat...');
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-c:a', 'aac',
          '-y', outputFile,
        ]);
        checkAbort(abortSignal);
      }

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Audio concat failed, trying video-only...');
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
          '-map', '[outv]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-an',
          '-y', outputFile,
        ]);
        checkAbort(abortSignal);
      }

      if (exitCode !== 0) throw new Error(`All concat methods failed for combo ${combination.id}`);

      const data = await ff.readFile(outputFile);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      try { await ff.deleteFile(outputFile); } catch {}
      try { await ff.deleteFile('concat.txt'); } catch {}

      return URL.createObjectURL(blob);

    } else {
      const hookData = await fetchFileCached(combination.hook.file);
      const bodyData = await fetchFileCached(combination.body.file);
      const ctaData = await fetchFileCached(combination.cta.file);
      await ff.writeFile('hook_raw.mp4', hookData);
      await ff.writeFile('body_raw.mp4', bodyData);
      await ff.writeFile('cta_raw.mp4', ctaData);

      const scale = getScale(settings);
      const outputFile = 'output.mp4';
      let exitCode: number;

      if (scale) {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
          '-filter_complex',
          `[0:v]scale=${scale},setsar=1[v0];` +
          `[1:v]scale=${scale},setsar=1[v1];` +
          `[2:v]scale=${scale},setsar=1[v2];` +
          `[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[outv][outa]`,
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-c:a', 'aac',
          '-y', outputFile,
        ]);
      } else {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-c:a', 'aac',
          '-y', outputFile,
        ]);
      }
      checkAbort(abortSignal);

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Direct concat failed, trying video-only...');
        if (scale) {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
            '-filter_complex',
            `[0:v]scale=${scale},setsar=1[v0];` +
            `[1:v]scale=${scale},setsar=1[v1];` +
            `[2:v]scale=${scale},setsar=1[v2];` +
            `[v0][v1][v2]concat=n=3:v=1:a=0[outv]`,
            '-map', '[outv]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-an',
            '-y', outputFile,
          ]);
        } else {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
            '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
            '-map', '[outv]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '30', '-an',
            '-y', outputFile,
          ]);
        }
        checkAbort(abortSignal);
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
    ff.off('log', logHandler);
  }
}

async function clearCache(): Promise<void> {
  if (!ffmpeg) return;
  for (const [, filename] of preProcessCache) {
    try { await ffmpeg.deleteFile(filename); } catch {}
  }
  preProcessCache.clear();
  cacheCounter = 0;
  console.log('[VideoProcessor] Cache cleared');
}

export async function processQueue(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  console.log(
    `%c[VideoProcessor] 🚀 Iniciando fila: ${combinations.length} combinações | Resolução: ${settings.resolution} | Pré-processo: ${settings.preProcess} | Batch: ${settings.batchSize}`,
    'color: #3b82f6; font-weight: bold; font-size: 14px;'
  );

  const onAbort = () => {
    console.log('[VideoProcessor] 🛑 Abort requested — terminating FFmpeg');
    terminateFFmpeg();
  };
  abortSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    // Phase 0: Pre-load all unique source files into memory cache
    const uniqueFiles = new Set<File>();
    for (const c of combinations) {
      uniqueFiles.add(c.hook.file);
      uniqueFiles.add(c.body.file);
      uniqueFiles.add(c.cta.file);
    }
    console.log(`[VideoProcessor] 📦 Pre-loading ${uniqueFiles.size} unique files into memory...`);
    await Promise.all(Array.from(uniqueFiles).map(f => fetchFileCached(f)));
    console.log('[VideoProcessor] ✅ All files pre-loaded');

    let ff = await getFFmpeg();

    if (settings.preProcess) {
      console.log('[VideoProcessor] ═══ Phase 1: Pre-processing unique files ═══');
      await preProcessAllInputs(ff, combinations, settings, (msg, pct) => {
        console.log(`[VideoProcessor] ${msg} (${pct}%)`);
      }, abortSignal);
    }

    checkAbort(abortSignal);

    // Validate: log expected combination count
    const expectedCount = combinations.length;
    console.log(
      `%c[VideoProcessor] ═══ Phase 2: Concatenating ${expectedCount} combinations (ALL must succeed) ═══`,
      'color: #3b82f6; font-weight: bold; font-size: 14px;'
    );

    const MAX_RETRIES = 5;
    const retryCount = new Map<number, number>();

    // Process ALL combinations, retrying failures until all succeed or max retries hit
    for (let i = 0; i < combinations.length; i++) {
      checkAbort(abortSignal);

      const combo = combinations[i];
      // Skip already done combos (from previous retry rounds)
      if (combo.status === 'done') continue;

      combo.status = 'processing';
      combo.errorMessage = undefined;
      onUpdate([...combinations]);

      const attempt = (retryCount.get(combo.id) || 0) + 1;
      const attemptLabel = attempt > 1 ? ` (tentativa ${attempt}/${MAX_RETRIES})` : '';

      try {
        if (!settings.preProcess) {
          ff = await maybeRecycleFFmpeg();
        }

        onProgressItem(5);
        console.log(`[VideoProcessor] 🎬 Processando combo ${combo.id}/${expectedCount}: ${combo.outputName}${attemptLabel}`);
        const url = await concatenateVideos(combo, settings, onProgressItem, abortSignal);
        checkAbort(abortSignal);
        if (!url) throw new Error('URL de saída vazia');
        onProgressItem(100);
        combo.status = 'done';
        combo.outputUrl = url;
        console.log(`%c[VideoProcessor] ✅ Combo ${combo.id} (${combo.outputName}) concluído!`, 'color: #22c55e; font-weight: bold;');
      } catch (err) {
        // If aborted, mark remaining as pending and exit
        if (abortSignal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          combo.status = 'pending';
          onUpdate([...combinations]);
          return; // exit entirely on abort
        }

        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[VideoProcessor] ❌ Combo ${combo.id} falhou${attemptLabel}: ${errorMsg}`);

        const retries = retryCount.get(combo.id) || 0;
        if (retries < MAX_RETRIES - 1) {
          // Retry: recycle FFmpeg and rebuild cache if needed
          console.log(`%c[VideoProcessor] ♻️ Reciclando FFmpeg e retentando combo ${combo.id} (${retries + 2}/${MAX_RETRIES})`, 'color: #f59e0b; font-weight: bold;');
          retryCount.set(combo.id, retries + 1);
          await terminateFFmpeg();
          ff = await getFFmpeg();
          if (settings.preProcess) {
            await preProcessAllInputs(ff, combinations, settings, undefined, abortSignal);
          }
          combo.status = 'pending';
          combo.errorMessage = undefined;
          i--; // retry same index
        } else {
          combo.status = 'error';
          combo.errorMessage = errorMsg;
          console.error(`[VideoProcessor] ❌ Combo ${combo.id} falhou após ${MAX_RETRIES} tentativas`);
        }
      }

      onUpdate([...combinations]);
      onProgressItem(0);
    }

    // Final validation: check all combos are done
    const doneCount = combinations.filter(c => c.status === 'done').length;
    const errorCount = combinations.filter(c => c.status === 'error').length;
    console.log(
      `%c[VideoProcessor] 📊 Resultado final: ${doneCount}/${expectedCount} concluídos, ${errorCount} erros`,
      doneCount === expectedCount ? 'color: #22c55e; font-weight: bold; font-size: 14px;' : 'color: #ef4444; font-weight: bold; font-size: 14px;'
    );

    if (!abortSignal?.aborted) {
      await clearCache();
      clearFetchFileCache();
    }
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
  }

  console.log(`[VideoProcessor] Queue complete. Done: ${combinations.filter(c => c.status === 'done').length}, Errors: ${combinations.filter(c => c.status === 'error').length}`);
}

/** Revoke all blob URLs from completed combinations to free memory */
export function revokeBlobUrls(combinations: Combination[]): void {
  for (const c of combinations) {
    if (c.outputUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(c.outputUrl);
    }
  }
}
