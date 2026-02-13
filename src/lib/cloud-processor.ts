import { supabase } from "@/integrations/supabase/client";
import type { Combination, ProcessingSettings } from "./video-processor";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transloadit-process`;
const MAX_POLL_ATTEMPTS = 120; // 120 * 3s = 6 min max
const PARALLEL_UPLOADS = 4;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Você precisa estar logado para usar o processamento em nuvem.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Upload a single file to storage and return a signed download URL */
async function uploadFileToStorage(file: File, userId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;

  console.log(`[CloudProcessor] Uploading "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

  const { error } = await supabase.storage.from("videos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    console.error(`%c[CloudProcessor] ❌ Upload falhou: ${file.name}`, 'color: #ef4444; font-weight: bold;', error);
    throw new Error(`Falha no upload de ${file.name}: ${error.message}`);
  }

  const { data } = await supabase.storage.from("videos").createSignedUrl(path, 7200);
  if (!data?.signedUrl) throw new Error(`Falha ao gerar URL para ${file.name}`);

  return data.signedUrl;
}

/** Upload all unique files in parallel batches and return a map File → URL */
async function uploadUniqueFiles(
  combinations: Combination[],
  onProgress?: (msg: string, pct: number) => void,
  abortSignal?: AbortSignal
): Promise<Map<File, string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const uniqueFiles = new Set<File>();
  for (const c of combinations) {
    uniqueFiles.add(c.hook.file);
    uniqueFiles.add(c.body.file);
    uniqueFiles.add(c.cta.file);
  }

  const files = Array.from(uniqueFiles);
  const urlMap = new Map<File, string>();
  let completed = 0;

  // Upload in parallel batches
  for (let i = 0; i < files.length; i += PARALLEL_UPLOADS) {
    if (abortSignal?.aborted) throw new Error("Cancelado");

    const batch = files.slice(i, i + PARALLEL_UPLOADS);
    const results = await Promise.all(
      batch.map(async (file) => {
        const url = await uploadFileToStorage(file, user.id);
        completed++;
        onProgress?.(
          `Enviando ${completed}/${files.length}: ${file.name}`,
          Math.round((completed / files.length) * 100)
        );
        return { file, url };
      })
    );

    for (const { file, url } of results) {
      urlMap.set(file, url);
    }
  }

  onProgress?.("Upload concluído", 100);
  return urlMap;
}

/** Poll assembly status until complete or error, with timeout */
async function pollAssembly(
  assemblyId: string,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const headers = await getAuthHeaders();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (abortSignal?.aborted) throw new Error("Cancelado");

    let res: Response;
    try {
      res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "check-status", assemblyId }),
      });
    } catch (fetchErr) {
      console.error(`%c[CloudProcessor] ❌ FETCH FALHOU (polling attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`, 'color: #ef4444; font-weight: bold;', {
        assemblyId,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        stack: fetchErr instanceof Error ? fetchErr.stack : undefined,
        url: FUNCTION_URL,
      });
      throw new Error(`Failed to fetch ao verificar status do assembly ${assemblyId}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(`%c[CloudProcessor] ❌ HTTP ${res.status} no polling`, 'color: #ef4444; font-weight: bold;', { assemblyId, status: res.status, errData });
      throw new Error(errData.error || `Status check failed: ${res.status}`);
    }

    const data = await res.json();

    if (data.progress) onProgress?.(data.progress);

    if (data.status === "ASSEMBLY_COMPLETED") {
      if (!data.resultUrl) throw new Error("Assembly concluído mas sem URL de resultado");
      return data.resultUrl;
    }

    if (data.status === "REQUEST_ABORTED" || data.status === "ASSEMBLY_CANCELED") {
      throw new Error("Assembly cancelado");
    }

    if (data.error) {
      throw new Error(`Transloadit error: ${data.error} – ${data.message || ""}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`Assembly ${assemblyId} expirou após ${MAX_POLL_ATTEMPTS * 3}s de polling`);
}

/** Main cloud processing queue */
export async function processQueueCloud(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  console.log(`[CloudProcessor] Starting cloud queue: ${combinations.length} combinations`);

  // Phase 1: Upload unique files (parallel)
  console.log("[CloudProcessor] ═══ Phase 1: Uploading files ═══");
  const urlMap = await uploadUniqueFiles(combinations, (msg, pct) => {
    console.log(`[CloudProcessor] ${msg} (${pct}%)`);
  }, abortSignal);

  if (abortSignal?.aborted) return;

  // Phase 2: Create assemblies in batches
  console.log("[CloudProcessor] ═══ Phase 2: Creating assemblies ═══");
  const headers = await getAuthHeaders();
  const batchSize = settings.batchSize || 3;

  for (let batchStart = 0; batchStart < combinations.length; batchStart += batchSize) {
    if (abortSignal?.aborted) break;

    const batch = combinations.slice(batchStart, batchStart + batchSize);
    const videoUrls = batch.map((combo) => ({
      hook: urlMap.get(combo.hook.file)!,
      body: urlMap.get(combo.body.file)!,
      cta: urlMap.get(combo.cta.file)!,
    }));

    for (const combo of batch) {
      combo.status = "processing";
    }
    onUpdate([...combinations]);

    try {
      let createRes: Response;
      try {
        createRes = await fetch(FUNCTION_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "create-assembly",
            videoUrls,
            resolution: settings.resolution,
          }),
        });
      } catch (fetchErr) {
        console.error(`%c[CloudProcessor] ❌ FETCH FALHOU ao criar assembly (batch ${batchStart})`, 'color: #ef4444; font-weight: bold; font-size: 13px;', {
          error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          stack: fetchErr instanceof Error ? fetchErr.stack : undefined,
          url: FUNCTION_URL,
          batchSize: batch.length,
        });
        throw new Error(`Failed to fetch ao criar assembly: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
      }

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        console.error(`%c[CloudProcessor] ❌ HTTP ${createRes.status} ao criar assembly`, 'color: #ef4444; font-weight: bold;', errData);
        throw new Error(errData.error || `Assembly creation failed: ${createRes.status}`);
      }

      const { assemblies } = await createRes.json();

      const promises = assemblies.map(
        async (a: { assemblyId: string; combinationIndex: number }) => {
          const combo = batch[a.combinationIndex];
          try {
            onProgressItem(10);
            const resultUrl = await pollAssembly(a.assemblyId, onProgressItem, abortSignal);
            combo.status = "done";
            combo.outputUrl = resultUrl;
            console.log(
              `%c[CloudProcessor] ✅ Combo ${combo.id} (${combo.outputName}) concluído!`,
              "color: #22c55e; font-weight: bold;"
            );
          } catch (err) {
            combo.status = "error";
            combo.errorMessage = err instanceof Error ? err.message : String(err);
            console.error(
              `%c[CloudProcessor] ❌ Combo ${combo.id}:`,
              "color: #ef4444; font-weight: bold;",
              combo.errorMessage
            );
          }
          onUpdate([...combinations]);
          onProgressItem(0);
        }
      );

      await Promise.all(promises);
    } catch (err) {
      for (const combo of batch) {
        if (combo.status === "processing") {
          combo.status = "error";
          combo.errorMessage = err instanceof Error ? err.message : String(err);
        }
      }
      onUpdate([...combinations]);
    }
  }

  const doneCount = combinations.filter((c) => c.status === "done").length;
  const errCount = combinations.filter((c) => c.status === "error").length;
  console.log(`[CloudProcessor] Queue complete. Done: ${doneCount}, Errors: ${errCount}`);
}
