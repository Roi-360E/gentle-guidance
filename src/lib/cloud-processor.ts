import { supabase } from "@/integrations/supabase/client";
import type { Combination, ProcessingSettings, VideoFile } from "./video-processor";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transloadit-process`;

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
  const path = `${userId}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage.from("videos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Falha no upload de ${file.name}: ${error.message}`);

  const { data } = await supabase.storage.from("videos").createSignedUrl(path, 7200);
  if (!data?.signedUrl) throw new Error(`Falha ao gerar URL para ${file.name}`);

  return data.signedUrl;
}

/** Upload all unique files and return a map File → URL */
async function uploadUniqueFiles(
  combinations: Combination[],
  onProgress?: (msg: string, pct: number) => void
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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Enviando ${i + 1}/${files.length}: ${file.name}`, Math.round(((i) / files.length) * 100));

    const url = await uploadFileToStorage(file, user.id);
    urlMap.set(file, url);
  }

  onProgress?.("Upload concluído", 100);
  return urlMap;
}

/** Poll assembly status until complete or error */
async function pollAssembly(
  assemblyId: string,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const headers = await getAuthHeaders();

  while (true) {
    if (abortSignal?.aborted) throw new Error("Cancelado");

    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "check-status", assemblyId }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
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

    // Wait 3 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
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

  // Phase 1: Upload unique files
  console.log("[CloudProcessor] ═══ Phase 1: Uploading files ═══");
  const urlMap = await uploadUniqueFiles(combinations, (msg, pct) => {
    console.log(`[CloudProcessor] ${msg} (${pct}%)`);
  });

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

    // Mark batch as processing
    for (const combo of batch) {
      combo.status = "processing";
    }
    onUpdate([...combinations]);

    try {
      const createRes = await fetch(FUNCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create-assembly",
          videoUrls,
          resolution: settings.resolution,
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || `Assembly creation failed: ${createRes.status}`);
      }

      const { assemblies } = await createRes.json();

      // Poll each assembly
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
      // Mark entire batch as error
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
