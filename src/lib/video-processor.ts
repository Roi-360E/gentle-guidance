import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

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
    vpsFileCache.clear();
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
// Cache of VPS-preprocessed File objects (to avoid sending raw files to VPS concat)
const vpsFileCache = new Map<File, File>();
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

  const startTime = performance.now();
  const scale = getScale(settings);
  console.log(`[VideoProcessor] Pre-processing ${file.name} → ${outputName} (${scale ? 'scale+encode' : 'fast remux'})`);

  let exitCode: number;

  if (scale) {
    // ─── SCALE + RE-ENCODE during pre-processing so concat can use stream copy ───
    exitCode = await ff.exec([
      '-i', rawName,
      '-vf', `scale=${scale},setsar=1`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main',
      '-pix_fmt', 'yuv420p', '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart', '-threads', '0',
      '-y', outputName,
    ]);
    checkAbort(abortSignal);

    // Fallback: no audio
    if (exitCode !== 0) {
      console.warn(`[VideoProcessor] Scale+encode failed for ${file.name}, trying without audio...`);
      exitCode = await ff.exec([
        '-i', rawName,
        '-vf', `scale=${scale},setsar=1`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-crf', '23', '-an', '-movflags', '+faststart',
        '-y', outputName,
      ]);
      checkAbort(abortSignal);
    }
  } else {
    // ─── NO SCALE: fast remux (stream copy) ───
    exitCode = await ff.exec([
      '-i', rawName,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart',
      '-y', outputName,
    ]);
    checkAbort(abortSignal);

    // If stream copy fails, lightweight re-encode
    if (exitCode !== 0) {
      console.warn(`[VideoProcessor] Stream copy failed for ${file.name}, fast re-encode fallback`);
      exitCode = await ff.exec([
        '-i', rawName,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-movflags', '+faststart', '-threads', '0',
        '-y', outputName,
      ]);
      checkAbort(abortSignal);
    }
  }

  // Final fallback: no audio, copy video
  if (exitCode !== 0) {
    console.warn(`[VideoProcessor] Retrying ${file.name} without audio...`);
    exitCode = await ff.exec([
      '-i', rawName,
      '-c:v', 'copy', '-an', '-movflags', '+faststart', '-y', outputName,
    ]);
    checkAbort(abortSignal);
    if (exitCode !== 0) throw new Error(`Failed to pre-process ${file.name}`);
  }

  try { await ff.deleteFile(rawName); } catch {}

  preProcessCache.set(file, outputName);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`[VideoProcessor] ✅ Cached "${file.name}" as ${outputName} in ${elapsed}s`);
  return outputName;
}

/**
 * Pre-process multiple files in parallel using a single FFmpeg instance.
 * Files are read into memory concurrently, then processed sequentially on FFmpeg
 * (since wasm is single-threaded) but with pre-fetched data to eliminate I/O waits.
 */
/**
 * Attempt to pre-process a single file via VPS (native FFmpeg = ~1-2s).
 * Returns a File with the preprocessed video, or null on failure.
 */
async function vpsPreprocessFile(file: File, settings?: ProcessingSettings): Promise<File | null> {
  try {
    const formData = new FormData();
    formData.append('video', file, file.name);

    // Send scale/resolution settings so VPS does native scaling (~3-4s)
    if (settings) {
      const scale = getScale(settings);
      if (scale) formData.append('scale', scale);
      formData.append('preset', 'ultrafast');
      formData.append('crf', '23');
    }

    const url = 'https://api.deploysites.online/preprocess';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2min for large files direct

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';

    // If JSON response → error
    if (contentType.includes('application/json')) {
      const data = await res.json();
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: ${data.error}`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: HTTP ${res.status}`);
      return null;
    }

    const blob = await res.blob();
    if (blob.size < 1000) {
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: response too small (${blob.size}b)`);
      return null;
    }

    return new File([blob], `vps_${file.name}`, { type: 'video/mp4' });
  } catch (err) {
    console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Pre-process multiple files. Strategy: VPS-first (native FFmpeg ~1-2s per file),
 * falls back to local WASM if VPS unavailable.
 */
export async function preProcessBatch(
  files: File[],
  sectionLabel: string,
  settings: ProcessingSettings,
  onFileProgress?: (fileIndex: number, status: 'loading' | 'processing' | 'done', pct: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  if (files.length === 0) return;

  // Skip files already in VPS cache
  const uncachedIndices: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (vpsFileCache.has(files[i]) || preProcessCache.has(files[i])) {
      console.log(`[VideoProcessor] ⚡ Cache hit for "${files[i].name}" — skipping`);
      onFileProgress?.(i, 'done', 100);
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) {
    console.log(`[VideoProcessor] ⚡ All ${files.length} files already cached for "${sectionLabel}" — nothing to do`);
    return;
  }

  const totalStart = performance.now();
  console.log(`[VideoProcessor] 🚀 Batch pre-processing ${uncachedIndices.length}/${files.length} files for "${sectionLabel}" (ALL-AT-ONCE VPS)`);

  // ─── FIRE ALL VPS REQUESTS AT ONCE — no chunking, no waiting ───
  let vpsAvailable = true;

  // Mark all as processing immediately
  uncachedIndices.forEach(idx => onFileProgress?.(idx, 'processing', 10));

  const allPromises = uncachedIndices.map(async (idx) => {
    const file = files[idx];
    console.log(`[VideoProcessor] 📄 [PARALLEL] VPS preprocess ${idx + 1}/${files.length}: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    const result = await vpsPreprocessFile(file, settings);
    if (result) {
      vpsFileCache.set(file, result);
      onFileProgress?.(idx, 'done', 100);
    }
    return { idx, ok: !!result };
  });

  const results = await Promise.all(allPromises);

  const vpsSuccessCount = results.filter(r => r.ok).length;
  const failedResults = results.filter(r => !r.ok);

  if (vpsSuccessCount > 0) {
    console.log(`[VideoProcessor] ⚡ VPS processed ${vpsSuccessCount}/${uncachedIndices.length} files in parallel`);
  }

  // If ALL failed, VPS is down
  if (vpsSuccessCount === 0 && uncachedIndices.length > 0) {
    console.log(`[VideoProcessor] ⚠️ All VPS requests failed, switching to WASM`);
    vpsAvailable = false;
  }

  if (failedResults.length > 0) {
    if (!vpsAvailable) {
      console.log(`[VideoProcessor] 📦 VPS unavailable, using local WASM for all ${failedResults.length} files...`);
    } else {
      console.log(`[VideoProcessor] ⚠️ ${failedResults.length} files failed VPS, falling back to local WASM`);
    }
    const failedIndices = failedResults.map(r => r.idx);
    const failedFiles = failedIndices.map(i => files[i]);
    await localPreprocessFiles(failedFiles, failedIndices, sectionLabel, settings, onFileProgress, abortSignal);
  }

  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(2);
  console.log(`[VideoProcessor] ✅ Batch "${sectionLabel}" complete: ${files.length} files in ${totalElapsed}s ${vpsAvailable ? '(VPS-ALL-AT-ONCE)' : '(WASM)'}`);
}

/** Fallback: local WASM pre-processing */
async function localPreprocessFiles(
  files: File[],
  originalIndices: number[],
  sectionLabel: string,
  settings: ProcessingSettings,
  onFileProgress?: (fileIndex: number, status: 'loading' | 'processing' | 'done', pct: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  // Pre-fetch all into memory
  await Promise.all(files.map(f => fetchFileCached(f)));

  const RECYCLE_EVERY = 20;
  for (let j = 0; j < files.length; j++) {
    const i = originalIndices[j];
    checkAbort(abortSignal);
    onFileProgress?.(i, 'processing', 30);

    if (j > 0 && j % RECYCLE_EVERY === 0) {
      await terminateFFmpeg();
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const currentFf = await getFFmpeg();
        const rawName = `raw_batch_${sectionLabel.toLowerCase()}_${i}.mp4`;
        await preProcessInputCached(currentFf, files[j], rawName, settings, abortSignal);
        break;
      } catch (err) {
        const isOOM = err instanceof Error && (err.message.includes('memory') || err.message.includes('RuntimeError'));
        if (isOOM && attempt < MAX_RETRIES) {
          await terminateFFmpeg();
          continue;
        }
        if (attempt === MAX_RETRIES) {
          console.error(`[VideoProcessor] ❌ Failed file ${i} after ${MAX_RETRIES} attempts, skipping`);
          break;
        }
        throw err;
      }
    }

    onFileProgress?.(i, 'done', 100);
  }
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

  // Use preProcessBatch which tries VPS first (~3-4s) then falls back to WASM
  await preProcessBatch(
    files,
    'AllInputs',
    settings,
    (fileIndex, status, pct) => {
      if (status === 'processing') {
        onProgress?.(`Normalizando ${fileIndex + 1}/${files.length}`, Math.round((fileIndex / files.length) * 100));
      } else if (status === 'done') {
        onProgress?.(`Normalizando ${fileIndex + 1}/${files.length}`, Math.round(((fileIndex + 1) / files.length) * 100));
      }
    },
    abortSignal
  );

  onProgress?.('Pré-processamento concluído', 100);
}

/**
 * Attempt concatenation via VPS (native FFmpeg = ~2-5s vs ~30-60s WASM).
 * Sends 3 source files to VPS and returns blob URL, or null on failure.
 */
async function vpsConcatenateFiles(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  try {
    const formData = new FormData();
    
    // Use VPS-preprocessed files if available (already normalized), otherwise raw files
    const hookFile = vpsFileCache.get(combination.hook.file) || combination.hook.file;
    const bodyFile = vpsFileCache.get(combination.body.file) || combination.body.file;
    const ctaFile = vpsFileCache.get(combination.cta.file) || combination.cta.file;
    
    formData.append('hook', hookFile, hookFile.name);
    formData.append('body', bodyFile, bodyFile.name);
    formData.append('cta', ctaFile, ctaFile.name);

    // Only send scale if files weren't pre-processed (raw files need scaling)
    const hasPreprocessed = vpsFileCache.has(combination.hook.file);
    if (!hasPreprocessed) {
      const scale = getScale(settings);
      if (scale) formData.append('scale', scale);
    }
    // When files are pre-processed, tell VPS to use stream copy (no re-encode)
    formData.append('preset', hasPreprocessed ? 'copy' : 'ultrafast');
    formData.append('crf', '23');

    const url = 'https://api.deploysites.online/concat';

    onProgress?.(15);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    // Start aggressive progress simulation while waiting for VPS
    let simProgress = 15;
    const progressTimer = setInterval(() => {
      simProgress = Math.min(simProgress + 8, 85);
      onProgress?.(simProgress);
    }, 500);

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearInterval(progressTimer);
    clearTimeout(timeoutId);
    onProgress?.(90);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      console.warn(`[VPS-Concat] ⚠️ combo ${combination.id}: ${data.error}`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[VPS-Concat] ⚠️ combo ${combination.id}: HTTP ${res.status}`);
      return null;
    }

    const blob = await res.blob();
    if (blob.size < 1000) {
      console.warn(`[VPS-Concat] ⚠️ combo ${combination.id}: response too small (${blob.size}b)`);
      return null;
    }

    onProgress?.(95);
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn(`[VPS-Concat] ⚠️ combo ${combination.id}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Track whether VPS concat is available (set once per queue run)
let vpsConcat: 'unknown' | 'available' | 'unavailable' = 'unknown';

export function resetVpsConcatStatus(): void {
  vpsConcat = 'unknown';
}

/**
 * Ensure VPS-preprocessed files are available in WASM preProcessCache.
 * Called once when VPS concat fails but vpsFileCache has data.
 */
async function hydrateWasmFromVpsCache(files: File[]): Promise<void> {
  const ff = await getFFmpeg();
  for (const file of files) {
    if (preProcessCache.has(file)) continue;
    const vpsFile = vpsFileCache.get(file);
    if (!vpsFile) continue;
    const outputName = getCacheKey(file);
    const data = await fetchFile(vpsFile);
    await ff.writeFile(outputName, new Uint8Array(data));
    preProcessCache.set(file, outputName);
    console.log(`[VideoProcessor] 💾 Hydrated WASM cache: ${file.name} → ${outputName}`);
  }
}

export async function concatenateVideos(
  combination: Combination,
  settings: ProcessingSettings,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  checkAbort(abortSignal);

  // ─── Try VPS concatenation first (native FFmpeg ~2-5s) ───
  if (vpsConcat !== 'unavailable') {
    console.log(`[VideoProcessor] 🌐 Trying VPS concat for combo ${combination.id}...`);
    const vpsUrl = await vpsConcatenateFiles(combination, settings, onProgress);
    if (vpsUrl) {
      vpsConcat = 'available';
      console.log(`[VideoProcessor] ⚡ VPS concat succeeded for combo ${combination.id}`);
      onProgress?.(100);
      return vpsUrl;
    }
    if (vpsConcat === 'unknown') {
      vpsConcat = 'unavailable';
      console.log(`[VideoProcessor] 📦 VPS concat unavailable, falling back to WASM`);
      // Hydrate WASM cache from VPS preprocessed files (avoids full re-preprocessing)
      if (vpsFileCache.size > 0) {
        const allFiles = [combination.hook.file, combination.body.file, combination.cta.file];
        await hydrateWasmFromVpsCache(allFiles);
      }
    }
  }

  // ─── Fallback: local WASM concatenation ───
  const ff = await getFFmpeg();
  console.log(`[VideoProcessor] Concatenating combo ${combination.id}: ${combination.outputName} (WASM)`);

  const progressHandler = ({ progress }: { progress: number }) => {
    // Accelerate progress reporting — multiply by 1.3 to make bar feel faster
    const pct = Math.min(Math.round(progress * 130), 100);
    if (pct > 0) onProgress?.(pct);
  };

  let lastLogProgress = 0;
  const logHandler = ({ message }: { message: string }) => {
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+)/);
    if (timeMatch) {
      // Jump progress more aggressively (10% increments)
      lastLogProgress = Math.min(lastLogProgress + 10, 95);
      onProgress?.(lastLogProgress);
    }
  };

  ff.on('progress', progressHandler);
  ff.on('log', logHandler);

  try {
    if (settings.preProcess) {
      // Hydrate WASM cache from VPS files if needed
      const comboFiles = [combination.hook.file, combination.body.file, combination.cta.file];
      if (vpsFileCache.size > 0 && comboFiles.some(f => !preProcessCache.has(f) && vpsFileCache.has(f))) {
        await hydrateWasmFromVpsCache(comboFiles);
      }

      // Auto-preprocess any missing files on-demand (fallback when VPS preprocess also failed)
      const filesToCheck = [
        { file: combination.hook.file, label: 'hook' },
        { file: combination.body.file, label: 'body' },
        { file: combination.cta.file, label: 'cta' },
      ];
      for (const { file, label } of filesToCheck) {
        if (!preProcessCache.has(file)) {
          console.log(`[VideoProcessor] 🔧 On-demand preprocess for ${label}: ${file.name}`);
          const rawName = `raw_${label}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
          await preProcessInputCached(ff, file, rawName, settings, abortSignal);
        }
      }

      const hookNorm = preProcessCache.get(combination.hook.file);
      const bodyNorm = preProcessCache.get(combination.body.file);
      const ctaNorm = preProcessCache.get(combination.cta.file);

      if (!hookNorm || !bodyNorm || !ctaNorm) {
        throw new Error(`Cache miss for combo ${combination.id} after on-demand preprocess`);
      }

      const outputFile = `out_${combination.id}.mp4`;

      // ─── ALWAYS use concat demuxer + stream copy (~1-2s) ───
      // Scaling was already applied during pre-processing, so no re-encode needed here
      const concatList = `file '${hookNorm}'\nfile '${bodyNorm}'\nfile '${ctaNorm}'\n`;
      await ff.writeFile('concat.txt', concatList);

      let exitCode = await ff.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', '-movflags', '+faststart', '-y', outputFile,
      ]);
      checkAbort(abortSignal);

      // Fallback 1: filter_complex re-encode (slower but handles codec mismatches)
      if (exitCode !== 0) {
        console.warn(`[VideoProcessor] ⚠️ Stream copy concat failed for combo ${combination.id}, re-encoding...`);
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
          '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
          '-y', outputFile,
        ]);
        checkAbort(abortSignal);
      }

      // Fallback 2: video-only (no audio)
      if (exitCode !== 0) {
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
          '-map', '[outv]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
          '-crf', '23', '-an', '-movflags', '+faststart',
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
          '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
          '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
          '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
          '-y', outputFile,
        ]);
      } else {
        exitCode = await ff.exec([
          '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
          '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
          '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
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
            '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
            '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
            '-an', '-movflags', '+faststart',
            '-y', outputFile,
          ]);
        } else {
          exitCode = await ff.exec([
            '-i', 'hook_raw.mp4', '-i', 'body_raw.mp4', '-i', 'cta_raw.mp4',
            '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]',
            '-map', '[outv]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
            '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
            '-an', '-movflags', '+faststart',
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
  vpsFileCache.clear();
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
  // Reset VPS concat detection for this queue run
  resetVpsConcatStatus();

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
    // Phase 0: Skip pre-loading if files already in cache (from preProcessBatch)
    const uniqueFiles = new Set<File>();
    for (const c of combinations) {
      uniqueFiles.add(c.hook.file);
      uniqueFiles.add(c.body.file);
      uniqueFiles.add(c.cta.file);
    }
    const uncachedFiles = Array.from(uniqueFiles).filter(f => !fetchFileCache.has(f));
    if (uncachedFiles.length > 0) {
      console.log(`[VideoProcessor] 📦 Pre-loading ${uncachedFiles.length} uncached files...`);
      await Promise.all(uncachedFiles.map(f => fetchFileCached(f)));
    } else {
      console.log(`[VideoProcessor] ⚡ All ${uniqueFiles.size} files already in memory cache — skipping Phase 0`);
    }

    // Phase 1: Skip if VPS already pre-processed all unique files
    let ff: FFmpeg | null = null;
    const allVpsCached = Array.from(uniqueFiles).every(f => vpsFileCache.has(f));
    const allLocalCached = Array.from(uniqueFiles).every(f => preProcessCache.has(f));

    if (settings.preProcess && !allVpsCached && !allLocalCached) {
      console.log('[VideoProcessor] ═══ Phase 1: Pre-processing unique files ═══');
      ff = await getFFmpeg();
      await preProcessAllInputs(ff, combinations, settings, (msg, pct) => {
        console.log(`[VideoProcessor] ${msg} (${pct}%)`);
      }, abortSignal);
    } else if (settings.preProcess) {
      console.log(`[VideoProcessor] ⚡ All files already pre-processed — skipping Phase 1 (VPS: ${allVpsCached}, WASM: ${allLocalCached})`);
    }

    checkAbort(abortSignal);

    // Validate: log expected combination count
    const expectedCount = combinations.length;
    console.log(
      `%c[VideoProcessor] ═══ Phase 2: Concatenating ${expectedCount} combinations (ALL must succeed) ═══`,
      'color: #3b82f6; font-weight: bold; font-size: 14px;'
    );

    // ─── Try VPS parallel concat first — fire ALL at once for max speed ───
    const VPS_PARALLEL_BATCH = 10; // aggressive parallelism for ~3s total
    let useVpsParallel = vpsFileCache.size > 0; // VPS files available = VPS is working

    if (useVpsParallel) {
      console.log(`[VideoProcessor] ⚡ VPS parallel concat: ${VPS_PARALLEL_BATCH} simultaneous`);
      
      for (let batchStart = 0; batchStart < combinations.length; batchStart += VPS_PARALLEL_BATCH) {
        checkAbort(abortSignal);
        
        const batch = combinations.slice(batchStart, batchStart + VPS_PARALLEL_BATCH);
        
        for (const combo of batch) {
          combo.status = 'processing';
          combo.errorMessage = undefined;
        }
        onUpdate([...combinations]);

        const results = await Promise.all(
          batch.map(async (combo) => {
            try {
              console.log(`[VideoProcessor] 🎬 VPS concat combo ${combo.id}: ${combo.outputName}`);
              const url = await vpsConcatenateFiles(combo, settings);
              if (url) {
                combo.status = 'done';
                combo.outputUrl = url;
                console.log(`%c[VideoProcessor] ✅ Combo ${combo.id} concluído (VPS)!`, 'color: #22c55e; font-weight: bold;');
                return true;
              }
              return false;
            } catch {
              return false;
            }
          })
        );

        onUpdate([...combinations]);

        // If first batch all failed, VPS concat is broken — fall back
        if (batchStart === 0 && results.every(r => !r)) {
          console.log(`[VideoProcessor] 📦 VPS parallel concat failed, falling back to sequential`);
          useVpsParallel = false;
          // Reset statuses
          for (const combo of batch) {
            if (combo.status !== 'done') {
              combo.status = 'pending';
            }
          }
          onUpdate([...combinations]);
          break;
        }
      }
    }

    // ─── Sequential fallback for remaining/failed combos ───
    const remaining = combinations.filter(c => c.status !== 'done');
    if (remaining.length > 0) {
      console.log(`[VideoProcessor] 🔄 Processing ${remaining.length} remaining combos sequentially`);
    }

    // Hydrate all VPS-preprocessed files to WASM cache once before sequential processing
    if (remaining.length > 0 && vpsFileCache.size > 0 && settings.preProcess) {
      console.log(`[VideoProcessor] 💾 Hydrating WASM cache from ${vpsFileCache.size} VPS files...`);
      const allUniqueFiles = Array.from(new Set(remaining.flatMap(c => [c.hook.file, c.body.file, c.cta.file])));
      await hydrateWasmFromVpsCache(allUniqueFiles);
    }

    const MAX_RETRIES = 5;
    const retryCount = new Map<number, number>();

    for (let i = 0; i < combinations.length; i++) {
      checkAbort(abortSignal);

      const combo = combinations[i];
      if (combo.status === 'done') continue;

      combo.status = 'processing';
      combo.errorMessage = undefined;
      onUpdate([...combinations]);

      const attempt = (retryCount.get(combo.id) || 0) + 1;
      const attemptLabel = attempt > 1 ? ` (tentativa ${attempt}/${MAX_RETRIES})` : '';

      try {
        if (!ff) {
          ff = await getFFmpeg();
        } else if (!settings.preProcess) {
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
        if (abortSignal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          combo.status = 'pending';
          onUpdate([...combinations]);
          return;
        }

        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[VideoProcessor] ❌ Combo ${combo.id} falhou${attemptLabel}: ${errorMsg}`);

        const retries = retryCount.get(combo.id) || 0;
        if (retries < MAX_RETRIES - 1) {
          console.log(`%c[VideoProcessor] ♻️ Reciclando FFmpeg e retentando combo ${combo.id} (${retries + 2}/${MAX_RETRIES})`, 'color: #f59e0b; font-weight: bold;');
          retryCount.set(combo.id, retries + 1);
          await terminateFFmpeg();
          ff = await getFFmpeg();
          if (settings.preProcess) {
            await preProcessAllInputs(ff, combinations, settings, undefined, abortSignal);
          }
          combo.status = 'pending';
          combo.errorMessage = undefined;
          i--;
        } else {
          combo.status = 'error';
          combo.errorMessage = errorMsg;
          console.error(`[VideoProcessor] ❌ Combo ${combo.id} falhou após ${MAX_RETRIES} tentativas`);
        }
      }

      onUpdate([...combinations]);
      onProgressItem(0);
    }

    // Final validation
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

/**
 * Remove existing subtitles from a video by covering the bottom region.
 * Uses a two-pass approach: first tries a smooth blur crop overlay,
 * then falls back to a solid drawbox if blur filters aren't available.
 *
 * @param file - The video file to process
 * @param regionPct - Percentage of video height from the bottom to clean (default 15%)
 * @param videoDimensions - Video width/height (needed to calculate the region)
 * @returns A new File with subtitles removed
 */
export async function removeSubtitlesFromFile(
  file: File,
  regionPct: number = 15,
  videoDimensions: { width: number; height: number },
): Promise<File> {
  const ff = await getFFmpeg();
  const inputName = `sub_rm_in_${Date.now()}.mp4`;
  const outputName = `sub_rm_out_${Date.now()}.mp4`;

  const data = await fetchFileCached(file);
  await ff.writeFile(inputName, data);

  const { width, height } = videoDimensions;
  const regionH = Math.round(height * (regionPct / 100));
  const regionY = height - regionH;

  // Strategy 1: drawbox with black fill (most compatible, clean result)
  let exitCode = await ff.exec([
    '-i', inputName,
    '-vf', `drawbox=x=0:y=${regionY}:w=${width}:h=${regionH}:color=black:t=fill`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'copy',
    '-y', outputName,
  ]);

  if (exitCode !== 0) {
    console.warn('[SubRemover] drawbox failed, trying crop+pad approach...');
    // Strategy 2: crop the top portion and pad it back to original size
    const keepH = height - regionH;
    exitCode = await ff.exec([
      '-i', inputName,
      '-vf', `crop=${width}:${keepH}:0:0,pad=${width}:${height}:0:0:black`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'copy',
      '-y', outputName,
    ]);
  }

  try { await ff.deleteFile(inputName); } catch {}

  if (exitCode !== 0) {
    throw new Error(`Falha ao remover legendas de ${file.name}`);
  }

  const outputData = await ff.readFile(outputName);
  try { await ff.deleteFile(outputName); } catch {}

  const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' });
  return new File([blob], file.name, { type: 'video/mp4' });
}
