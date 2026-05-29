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
    vpsCacheIdMap.clear();
    vpsPreprocessPromises.clear();
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
  // Turbo default: never re-scale before concat unless the user explicitly asks.
  // Re-encoding large videos is the main bottleneck; original keeps preprocessing
  // to upload/cache only and lets VPS concat use the fast stream-copy path.
  resolution: 'original',
  batchSize: 3,
  preProcess: false,
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

// Build a scale filter that preserves the original aspect ratio.
// Uses scale+pad so vertical sources stay vertical (no stretching) and any
// gap is filled with black bars instead of distorting the image.
function buildScaleFilter(scale: string): string {
  const [w, h] = scale.split(':');
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
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
// Cache of VPS-preprocessed File objects (legacy fallback for old VPS versions)
const vpsFileCache = new Map<File, File>();
// Cache of VPS-side IDs — when present, concat can be done by reference (no re-upload!)
const vpsCacheIdMap = new Map<File, string>();
// In-flight VPS uploads. Prevents duplicate uploads when the user clicks "Gerar"
// while the 7s UI preprocessing window has already released the button.
const vpsPreprocessPromises = new Map<File, Promise<VpsPreprocessResult>>();
// Local fallback cache for normalized concat inputs. This is used when the VPS
// route/domain is down, avoiding fragile multi-input filter_complex commands.
const localConcatCache = new Map<string, string>();
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
      '-vf', buildScaleFilter(scale),
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
        '-vf', buildScaleFilter(scale),
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
type VpsPreprocessResult =
  | { type: 'id'; cacheId: string }
  | { type: 'file'; file: File }
  | null;

const PREPROCESS_UI_BUDGET_MS = 7000;
const CONCAT_QUEUE_TARGET_MS = 55_000;
const CONCAT_QUEUE_HARD_LIMIT_MS = 120_000;
const CONCAT_PENDING_UPLOAD_BUDGET_MS = 18_000;
const VPS_BASE_URL = 'https://api.escalaxpro.com';
const VPS_PREPROCESS_URL = `${VPS_BASE_URL}/preprocess`;
const VPS_CONCAT_URL = `${VPS_BASE_URL}/concat`;
const VPS_HEALTH_CACHE_MS = 15_000;
let vpsHealthCache: { ok: boolean; checkedAt: number } | null = null;

async function isVpsReachable(timeoutMs = 2500, force = false): Promise<boolean> {
  const now = performance.now();
  if (!force && vpsHealthCache && now - vpsHealthCache.checkedAt < VPS_HEALTH_CACHE_MS) {
    return vpsHealthCache.ok;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Empty POST: healthy Flask returns a fast 400 (no video file). Network
    // timeout/refused means the VPS/tunnel is down, so fail fast instead of
    // spawning dozens of long /preprocess and /concat requests.
    const res = await fetch(VPS_PREPROCESS_URL, {
      method: 'POST',
      body: new FormData(),
      signal: controller.signal,
    });
    const ok = res.status < 500;
    vpsHealthCache = { ok, checkedAt: performance.now() };
    return ok;
  } catch {
    vpsHealthCache = { ok: false, checkedAt: performance.now() };
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function vpsPreprocessFile(file: File, settings?: ProcessingSettings): Promise<VpsPreprocessResult> {
  const fileStart = performance.now();
  try {
    if (!(await isVpsReachable())) {
      console.warn(`[VPS-Preprocess] ⚠️ VPS indisponível; não vou iniciar upload de ${file.name}`);
      return null;
    }

    const formData = new FormData();
    formData.append('video', file, file.name);
    // Ask VPS to cache the result server-side and return only an ID (no download bytes).
    formData.append('mode', 'cache');

    // ── OTIMIZAÇÃO: se não precisa re-escalar, manda passthrough (zero re-encode na VPS) ──
    // Isso reduz o tempo do servidor de ~3-5s/arquivo para ~0.3-0.8s/arquivo (só I/O).
    const scale = settings ? getScale(settings) : null;
    if (scale) {
      formData.append('scale', scale);
      formData.append('preset', 'ultrafast');
      formData.append('crf', '28');
    } else {
      // Sem reescala: VPS apenas remuxa pra MP4 fragmentado (rápido) ou copia direto.
      formData.append('passthrough', '1');
      formData.append('preset', 'ultrafast');
    }

    const controller = new AbortController();
    const sizeMB = file.size / (1024 * 1024);
    // Keep background uploads bounded; if it cannot upload quickly, it cannot
    // help the 1-minute concat target and should fail cleanly.
    const timeoutMs = scale ? 45_000 : 30_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    console.log(`[VPS-Preprocess] ⬆️ Uploading ${file.name} (${sizeMB.toFixed(1)}MB, ${scale ? 'scale='+scale : 'passthrough'}) timeout=${(timeoutMs/1000).toFixed(0)}s`);

    const res = await fetch(VPS_PREPROCESS_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';

    // ─── New cache mode: VPS returns JSON with cache_id ───
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok || data.error) {
        console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: ${data.error || `HTTP ${res.status}`}`);
        return null;
      }
      if (data.cache_id) {
        const totalMs = (performance.now() - fileStart).toFixed(0);
        console.log(`[VPS-Preprocess] ✅ ${file.name}: cached on VPS as ${data.cache_id} in ${totalMs}ms (no download)`);
        return { type: 'id', cacheId: data.cache_id };
      }
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: unexpected JSON response`);
      return null;
    }

    // ─── Legacy mode: VPS returned binary (old version without cache support) ───
    if (!res.ok) {
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: HTTP ${res.status}`);
      return null;
    }

    const blob = await res.blob();
    const totalMs = (performance.now() - fileStart).toFixed(0);

    if (blob.size < 1000) {
      console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: response too small (${blob.size}b)`);
      return null;
    }

    console.log(`[VPS-Preprocess] ✅ ${file.name}: ${sizeMB.toFixed(1)}MB→${(blob.size/1024/1024).toFixed(1)}MB in ${totalMs}ms (legacy mode)`);
    return { type: 'file', file: new File([blob], `vps_${file.name}`, { type: 'video/mp4' }) };
  } catch (err) {
    const totalMs = (performance.now() - fileStart).toFixed(0);
    const reason = err instanceof DOMException && err.name === 'AbortError' ? `TIMEOUT` : (err instanceof Error ? err.message : String(err));
    console.warn(`[VPS-Preprocess] ⚠️ ${file.name}: ${reason} (${totalMs}ms)`);
    return null;
  }
}

function getOrStartVpsPreprocess(file: File, settings: ProcessingSettings): Promise<VpsPreprocessResult> {
  const cachedId = vpsCacheIdMap.get(file);
  if (cachedId) return Promise.resolve({ type: 'id', cacheId: cachedId });
  const cachedFile = vpsFileCache.get(file);
  if (cachedFile) return Promise.resolve({ type: 'file', file: cachedFile });
  const inFlight = vpsPreprocessPromises.get(file);
  if (inFlight) return inFlight;

  const promise = vpsPreprocessFile(file, settings).then((result) => {
    if (result?.type === 'id') vpsCacheIdMap.set(file, result.cacheId);
    if (result?.type === 'file') vpsFileCache.set(file, result.file);
    return result;
  }).finally(() => {
    vpsPreprocessPromises.delete(file);
  });
  vpsPreprocessPromises.set(file, promise);
  return promise;
}

function waitForUiBudget<T>(promise: Promise<T>, budgetMs = PREPROCESS_UI_BUDGET_MS): Promise<T | 'budget-exceeded'> {
  return Promise.race([
    promise,
    new Promise<'budget-exceeded'>((resolve) => setTimeout(() => resolve('budget-exceeded'), budgetMs)),
  ]);
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

  // Skip files already in any cache (VPS ID, VPS legacy file, or local WASM)
  const uncachedIndices: number[] = [];
  for (let i = 0; i < files.length; i++) {
    if (vpsCacheIdMap.has(files[i]) || vpsFileCache.has(files[i]) || preProcessCache.has(files[i])) {
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
  const deadline = totalStart + PREPROCESS_UI_BUDGET_MS;
  // Concurrency: a VPS está atrás de Cloudflare (HTTP/2 multiplexado) — sem limite
  // de 6 conexões por host. Subimos para 24 paralelos para saturar a banda de
  // upload e reduzir drasticamente o tempo total quando há muitos arquivos.
  const CONCURRENCY = Math.min(24, uncachedIndices.length);
  console.log(`[VideoProcessor] 🚀 Batch pre-processing ${uncachedIndices.length}/${files.length} files for "${sectionLabel}" (concurrency=${CONCURRENCY})`);

  const failedIndices: number[] = [];
  const stillUploadingIndices: number[] = [];

  // Mark all as queued/processing immediately for UI feedback
  uncachedIndices.forEach(idx => onFileProgress?.(idx, 'processing', 5));

  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (abortSignal?.aborted) return;
      const pos = cursor++;
      if (pos >= uncachedIndices.length) return;
      const idx = uncachedIndices[pos];
      const file = files[idx];

      console.log(`[VideoProcessor] 📄 [${pos + 1}/${uncachedIndices.length}] VPS preprocess: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      onFileProgress?.(idx, 'processing', 15);

      const uploadPromise = getOrStartVpsPreprocess(file, settings);
      const remainingBudget = Math.max(0, deadline - performance.now());
      const result = await waitForUiBudget(uploadPromise, remainingBudget);
      if (result === 'budget-exceeded') {
        stillUploadingIndices.push(idx);
        onFileProgress?.(idx, 'done', 100);
        console.log(`[VideoProcessor] ⏱️ ${file.name}: released pre-process UI at 7s; upload continues in background`);
        continue;
      }
      if (result?.type === 'id') {
        vpsCacheIdMap.set(file, result.cacheId);
        onFileProgress?.(idx, 'done', 100);
      } else if (result?.type === 'file') {
        vpsFileCache.set(file, result.file);
        onFileProgress?.(idx, 'done', 100);
      } else {
        failedIndices.push(idx);
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, uncachedIndices.length) }, () => worker());
  await Promise.all(workers);

  if (failedIndices.length > 0) {
    console.log(`[VideoProcessor] ⚠️ ${failedIndices.length} files failed VPS during the 7s window; they will retry on-demand during concat`);
    failedIndices.forEach(idx => onFileProgress?.(idx, 'done', 100));
  }

  if (stillUploadingIndices.length > 0) {
    console.log(`[VideoProcessor] ⏱️ ${stillUploadingIndices.length} heavy file(s) still uploading in background after the 7s pre-process budget`);
  }

  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(2);
  console.log(`[VideoProcessor] ✅ Batch "${sectionLabel}" complete: ${files.length} files in ${totalElapsed}s (FULL PARALLEL)`);
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
  deadlineAt?: number,
  allowRawUpload = true,
): Promise<string | null> {
  try {
    if (!(await isVpsReachable(2000))) {
      console.warn(`[VPS-Concat] ⚠️ VPS indisponível; combo ${combination.id} não será enviado`);
      return null;
    }

    const formData = new FormData();

    // Always reuse in-flight VPS uploads (dedup): if another combo is already
    // uploading the same file, wait for it instead of uploading bytes again.
    // This applies even when preProcess=false — the queue kicks off implicit
    // uploads for unique files so each file is sent to VPS only ONCE.
    {
      const comboFiles = [combination.hook.file, combination.body.file, combination.cta.file];
      const waitBudget = deadlineAt
        ? Math.min(CONCAT_PENDING_UPLOAD_BUDGET_MS, Math.max(0, deadlineAt - performance.now()))
        : CONCAT_PENDING_UPLOAD_BUDGET_MS;
      if (waitBudget <= 0) return null;

      const waitResults = await Promise.all(comboFiles.map(async (file) => {
        if (vpsCacheIdMap.has(file) || vpsFileCache.has(file)) return;
        const pending = vpsPreprocessPromises.get(file);
        if (pending) return waitForUiBudget(pending.catch(() => null), waitBudget);
      }));
      if (waitResults.includes('budget-exceeded')) {
        if (!allowRawUpload) {
          console.warn(`[VPS-Concat] ⏱️ combo ${combination.id}: upload cache ainda não terminou; pulando raw upload`);
          return null;
        }
        console.warn(`[VPS-Concat] ⏱️ combo ${combination.id}: cache ainda não terminou; tentando upload direto para não gerar erro automático`);
      }
    }

    // ─── FAST PATH: all 3 files cached on VPS by ID → zero re-upload ───
    const hookId = vpsCacheIdMap.get(combination.hook.file);
    const bodyId = vpsCacheIdMap.get(combination.body.file);
    const ctaId = vpsCacheIdMap.get(combination.cta.file);
    const allCachedById = !!(hookId && bodyId && ctaId);

    if (allCachedById) {
      formData.append('hook_id', hookId!);
      formData.append('body_id', bodyId!);
      formData.append('cta_id', ctaId!);
      formData.append('preset', 'copy');
      formData.append('crf', '23');
      console.log(`[VPS-Concat] ⚡ combo ${combination.id}: using cached IDs (no upload)`);
    } else {
      const allCachedAsFiles = [combination.hook.file, combination.body.file, combination.cta.file].every(file => vpsFileCache.has(file));
      if (!allowRawUpload && !allCachedAsFiles) {
        console.warn(`[VPS-Concat] ⏭️ combo ${combination.id}: sem cache pronto; re-upload bruto bloqueado para não passar de 1 minuto`);
        return null;
      }

      // Fallback: send files (legacy/non-cached path)
      const hookFile = vpsFileCache.get(combination.hook.file) || combination.hook.file;
      const bodyFile = vpsFileCache.get(combination.body.file) || combination.body.file;
      const ctaFile = vpsFileCache.get(combination.cta.file) || combination.cta.file;

      formData.append('hook', hookFile, hookFile.name);
      formData.append('body', bodyFile, bodyFile.name);
      formData.append('cta', ctaFile, ctaFile.name);

      const hasPreprocessed = vpsFileCache.has(combination.hook.file);
      if (!hasPreprocessed) {
        const scale = getScale(settings);
        if (scale) formData.append('scale', scale);
      }
      formData.append('preset', hasPreprocessed ? 'copy' : 'ultrafast');
      formData.append('crf', '23');
    }

    onProgress?.(15);

    const controller = new AbortController();
    // FAST PATH (IDs cacheados, zero upload): 10s sobra de folga pro stream-copy nativo.
    // SLOW PATH: no máximo 45s e sempre limitado pelo orçamento global de 1 minuto.
    const remainingQueueTime = deadlineAt ? Math.max(5_000, deadlineAt - performance.now()) : Infinity;
    const timeoutMs = Math.min(allCachedById ? 10000 : 45000, remainingQueueTime);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Simulação suave: avança em passos menores e mais frequentes pra dar
    // sensação de fluidez sem chegar a 100% antes do fim real.
    let simProgress = 15;
    const progressTimer = setInterval(() => {
      simProgress = Math.min(simProgress + 2, 70);
      onProgress?.(simProgress);
    }, 300);

    let res: Response;
    try {
      res = await fetch(VPS_CONCAT_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearInterval(progressTimer);
      clearTimeout(timeoutId);
    }
    onProgress?.(85);

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
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[VPS-Concat] ⚠️ combo ${combination.id}: ${isTimeout ? 'TIMEOUT no orçamento de 1 minuto' : msg}`);
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

async function getLocalConcatInput(
  ff: FFmpeg,
  file: File,
  role: string,
  settings: ProcessingSettings,
  abortSignal?: AbortSignal,
): Promise<string> {
  const cached = localConcatCache.get(`${role}:${file.name}:${file.size}:${file.lastModified}:${settings.videoFormat}:${settings.resolution}`);
  if (cached) return cached;

  const safeRole = role.replace(/[^a-zA-Z0-9_]/g, '_');
  const inputName = `local_${safeRole}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const outputName = `local_norm_${safeRole}_${Date.now()}.mp4`;
  const data = await fetchFileCached(file);
  await ff.writeFile(inputName, data);

  const scale = getScale(settings);
  const args = scale
    ? ['-i', inputName, '-vf', buildScaleFilter(scale), '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-y', outputName]
    : ['-i', inputName, '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-y', outputName];

  let exitCode = await ff.exec(args);
  checkAbort(abortSignal);

  if (exitCode !== 0) {
    console.warn(`[VideoProcessor] ⚠️ ${role}: normalização com áudio falhou; criando áudio silencioso`);
    const videoOnlyArgs = scale
      ? ['-i', inputName, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-vf', buildScaleFilter(scale), '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-y', outputName]
      : ['-i', inputName, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-y', outputName];
    exitCode = await ff.exec(videoOnlyArgs);
    checkAbort(abortSignal);
  }

  try { await ff.deleteFile(inputName); } catch {}
  if (exitCode !== 0) throw new Error(`Falha ao normalizar ${role}: ${file.name}`);

  localConcatCache.set(`${role}:${file.name}:${file.size}:${file.lastModified}:${settings.videoFormat}:${settings.resolution}`, outputName);
  return outputName;
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
      const hookNorm = await getLocalConcatInput(ff, combination.hook.file, 'hook', settings, abortSignal);
      const bodyNorm = await getLocalConcatInput(ff, combination.body.file, 'body', settings, abortSignal);
      const ctaNorm = await getLocalConcatInput(ff, combination.cta.file, 'cta', settings, abortSignal);

      const outputFile = `output_${combination.id}.mp4`;
      const concatFile = `concat_${combination.id}.txt`;
      await ff.writeFile(concatFile, `file '${hookNorm}'\nfile '${bodyNorm}'\nfile '${ctaNorm}'\n`);

      let exitCode = await ff.exec([
        '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-c', 'copy', '-movflags', '+faststart', '-y', outputFile,
      ]);
      checkAbort(abortSignal);

      if (exitCode !== 0) {
        console.warn('[VideoProcessor] Demuxer concat failed, trying normalized filter concat...');
        exitCode = await ff.exec([
          '-i', hookNorm, '-i', bodyNorm, '-i', ctaNorm,
          '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
          '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
          '-y', outputFile,
        ]);
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
  if (ffmpeg) {
    for (const [, filename] of preProcessCache) {
      try { await ffmpeg.deleteFile(filename); } catch {}
    }
  }
  preProcessCache.clear();
  vpsFileCache.clear();
  vpsCacheIdMap.clear();
  vpsPreprocessPromises.clear();
    localConcatCache.clear();
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
    if (!settings.preProcess && uncachedFiles.length > 0) {
      console.log(`[VideoProcessor] 📦 Pre-loading ${uncachedFiles.length} uncached files...`);
      await Promise.all(uncachedFiles.map(f => fetchFileCached(f)));
    } else if (settings.preProcess) {
      console.log('[VideoProcessor] ⚡ Skipping local file pre-load — VPS background cache is the fast path');
    } else {
      console.log(`[VideoProcessor] ⚡ All ${uniqueFiles.size} files already in memory cache — skipping Phase 0`);
    }

    // Phase 1: Skip if VPS already pre-processed all unique files
    let ff: FFmpeg | null = null;
    const allVpsCached = Array.from(uniqueFiles).every(f => vpsCacheIdMap.has(f) || vpsFileCache.has(f) || vpsPreprocessPromises.has(f));
    const allLocalCached = Array.from(uniqueFiles).every(f => preProcessCache.has(f));

    if (settings.preProcess && !allVpsCached && !allLocalCached) {
      console.log('[VideoProcessor] ═══ Phase 1: Pre-processing unique files ═══');
      // Do not load FFmpeg here in turbo mode; preProcessAllInputs uses VPS cache first.
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
    const queueTargetAt = performance.now() + CONCAT_QUEUE_TARGET_MS;
    const queueHardDeadlineAt = performance.now() + CONCAT_QUEUE_HARD_LIMIT_MS;
    const vpsAvailableAtStart = await isVpsReachable(2500, true);

    if (!vpsAvailableAtStart) {
      console.warn('[VideoProcessor] 🚨 VPS/túnel indisponível; bloqueando fila para evitar timeouts em massa');
      for (const combo of combinations) {
        combo.status = 'error';
        combo.errorMessage = 'Servidor de vídeo indisponível no momento. Reinicie a VPS/Cloudflare Tunnel e tente novamente.';
      }
      onUpdate([...combinations]);
      onProgressItem(0);
      return;
    }

    // ─── IMPLICIT DEDUP UPLOAD: even when preProcess=false, upload each unique
    // file to VPS ONCE (fire-and-forget). Without this, every combo re-uploads
    // the same 3 files → 18 combos × 3 = 54 uploads. With dedup, only N unique
    // files are sent (e.g. 8), saving ~60s+ of bandwidth time.
    if (vpsAvailableAtStart) {
      const allUnique = Array.from(uniqueFiles).filter(
        f => !vpsCacheIdMap.has(f) && !vpsFileCache.has(f) && !vpsPreprocessPromises.has(f)
      );
      if (allUnique.length > 0) {
        console.log(`[VideoProcessor] 📤 Implicit dedup upload: ${allUnique.length} unique files → VPS (parallel)`);
        // Fire-and-forget; vpsConcatenateFiles will await per-file in-flight promises.
        for (const f of allUnique) {
          getOrStartVpsPreprocess(f, settings).catch(() => null);
        }
      }
    }

    // Give the dedup uploads a bounded head start, but never let this phase eat
    // the full minute. Once IDs are ready, every combination uses zero re-upload.
    {
      const pendingUploads = Array.from(uniqueFiles)
        .filter(f => !vpsCacheIdMap.has(f) && !vpsFileCache.has(f))
        .map(f => vpsPreprocessPromises.get(f))
        .filter((p): p is Promise<VpsPreprocessResult> => !!p);
      if (pendingUploads.length > 0) {
        const uploadWaitMs = Math.min(40_000, Math.max(0, queueTargetAt - performance.now() - 15_000));
        if (uploadWaitMs > 0) {
          console.log(`[VideoProcessor] ⏱️ Aguardando cache VPS pronto por até ${Math.round(uploadWaitMs / 1000)}s para não re-upar por combo`);
          const uploadResult = await waitForUiBudget(Promise.all(pendingUploads.map(p => p.catch(() => null))), uploadWaitMs);
          if (uploadResult === 'budget-exceeded') {
            console.warn('[VideoProcessor] ⏱️ Cache VPS ainda incompleto; combos sem cache tentarão upload direto em vez de erro imediato');
          }
        }
      }
    }

    // ─── VPS concat sempre paralelo (mesmo sem pré-processo). A VPS está atrás
    // de Cloudflare HTTP/2 multiplexado — não há limite de 6 conexões por host.
    let useVpsSequential = true;
    let vpsFailedCount = 0;

    if (useVpsSequential) {
      const hasCacheIds = vpsCacheIdMap.size > 0 || vpsPreprocessPromises.size > 0;
      // FAST PATH (IDs cacheados, zero upload na VPS): 24 paralelos.
      // SLOW PATH (ainda subindo): 20 paralelos — HTTP/2 multiplexa numa
      // única conexão TCP, então mais workers saturam o pipe sem custo.
      const VPS_CONCURRENCY = hasCacheIds ? 24 : 20;
      console.log(`[VideoProcessor] ⚡ VPS parallel concat: ${combinations.length} combos, concurrency=${VPS_CONCURRENCY} (cacheIds=${hasCacheIds})`);

      let completed = 0;
      let failedCount = 0;
      let cursor = 0;
      // Aborta o caminho VPS só se 3+ combos falharem seguidos OU >50% falharem
      const FAIL_THRESHOLD = Math.max(3, Math.ceil(combinations.length * 0.5));

      const worker = async (workerId: number): Promise<void> => {
        while (true) {
          if (failedCount >= FAIL_THRESHOLD) return;
          const i = cursor++;
          if (i >= combinations.length) return;
          checkAbort(abortSignal);

          const combo = combinations[i];
          if (combo.status === 'done') {
            completed++;
            continue;
          }

          combo.status = 'processing';
          combo.errorMessage = undefined;
          onUpdate([...combinations]);

          try {
            console.log(`[VideoProcessor] 🎬 [W${workerId}] [${i + 1}/${combinations.length}] VPS concat: ${combo.outputName}`);
            // Keep raw-upload fallback enabled: when cache IDs are not ready, the
            // combo must still be attempted instead of becoming an instant error.
            const url = await vpsConcatenateFiles(combo, settings, undefined, queueHardDeadlineAt, true);
            if (url) {
              combo.status = 'done';
              combo.outputUrl = url;
              completed++;
              console.log(`%c[VideoProcessor] ✅ [${completed}/${combinations.length}] ${combo.outputName} (VPS)`, 'color: #22c55e; font-weight: bold;');
              onUpdate([...combinations]);
              onProgressItem(Math.round((completed / combinations.length) * 100));
              continue;
            }
          } catch {
            // VPS falhou para este combo
          }

          failedCount++;
          combo.status = 'pending'; // será retentado no fallback WASM
          onUpdate([...combinations]);
        }
      };

      const workers = Array.from({ length: Math.min(VPS_CONCURRENCY, combinations.length) }, (_, idx) => worker(idx + 1));
      await Promise.all(workers);
      vpsFailedCount = failedCount;

      if (failedCount >= FAIL_THRESHOLD) {
        console.log(`[VideoProcessor] 📦 VPS instável (${failedCount} falhas), restante via WASM`);
        useVpsSequential = false;
      } else if (failedCount > 0) {
        console.log(`[VideoProcessor] ⚠️ VPS: ${completed}/${combinations.length} OK, ${failedCount} falhas → retry sequencial`);
      }
    }


    // ─── Sequential fallback for remaining/failed combos ───
    const remaining = combinations.filter(c => c.status !== 'done');
    if (remaining.length > 0) {
      const timeLeft = queueHardDeadlineAt - performance.now();
      if (timeLeft < 15_000 || vpsFailedCount >= Math.max(3, Math.ceil(combinations.length * 0.5))) {
        console.warn(`[VideoProcessor] ⏱️ Limite de segurança atingido: ${remaining.length} combo(s) não irão para fallback WASM lento`);
        for (const combo of remaining) {
          combo.status = 'error';
          combo.errorMessage = 'Servidor de vídeo não respondeu a tempo. Tente ativar o pré-processamento ou envie vídeos menores.';
        }
        onUpdate([...combinations]);
        return;
      }
      console.log(`[VideoProcessor] 🔄 Processing ${remaining.length} remaining combos sequentially (timeLeft=${Math.round(timeLeft / 1000)}s)`);
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
