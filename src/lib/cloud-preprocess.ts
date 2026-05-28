import { supabase } from "@/integrations/supabase/client";
import type { ProcessingSettings } from "./video-processor";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transloadit-process`;
const MAX_POLL_ATTEMPTS = 120; // 6 min max per file

function getCloudPreprocessError(data: { error?: string; errorCode?: string; details?: string }) {
  if (data.errorCode === "TRANSLOADIT_AUTH_ERROR") {
    return "Pré-processamento em nuvem indisponível: a chave Transloadit configurada é de SmartCDN e não serve para processar vídeos.";
  }
  return data.error || data.details || "Pré-processamento em nuvem indisponível.";
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Você precisa estar logado para usar o processamento em nuvem.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Upload a file to storage and return a signed URL */
async function uploadToStorage(file: File, userId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}`;

  const { error } = await supabase.storage.from("videos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Upload falhou: ${file.name}: ${error.message}`);

  const { data } = await supabase.storage.from("videos").createSignedUrl(path, 7200);
  if (!data?.signedUrl) throw new Error(`Falha ao gerar URL para ${file.name}`);
  return data.signedUrl;
}

/** Poll a preprocess assembly until complete */
async function pollPreprocessAssembly(
  assemblyId: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const headers = await getAuthHeaders();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "check-preprocess-status", assemblyId }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Status check failed: ${res.status}`);
    }

    const data = await res.json();
    if (data?.ok === false || data?.fallback === true) {
      throw new Error(getCloudPreprocessError(data));
    }
    if (data.progress) onProgress?.(data.progress);

    if (data.status === "ASSEMBLY_COMPLETED") {
      if (!data.resultUrl) throw new Error("Normalização concluída mas sem URL de resultado");
      return data.resultUrl;
    }

    if (data.status === "REQUEST_ABORTED" || data.status === "ASSEMBLY_CANCELED") {
      throw new Error("Normalização cancelada");
    }

    if (data.error) {
      throw new Error(`Transloadit error: ${data.error}`);
    }

    await new Promise((r) => setTimeout(r, 2500));
  }

  throw new Error(`Normalização expirou após ${MAX_POLL_ATTEMPTS * 2.5}s`);
}

/** Download a normalized video from URL and return as File */
async function downloadNormalizedFile(url: string, originalName: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download falhou: ${response.status}`);
  const blob = await response.blob();
  const normalizedName = `norm_${originalName}`;
  return new File([blob], normalizedName, { type: "video/mp4" });
}

export interface CloudPreprocessResult {
  originalFile: File;
  normalizedFile: File;
}

/**
 * Pre-process files on the server (Transloadit) for much faster normalization.
 * Uploads raw files → Transloadit normalizes → downloads normalized versions.
 */
export async function cloudPreprocessFiles(
  files: File[],
  settings: ProcessingSettings,
  onProgress?: (fileIndex: number, status: "uploading" | "processing" | "downloading" | "done", pct: number) => void,
): Promise<CloudPreprocessResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const headers = await getAuthHeaders();
  const results: CloudPreprocessResult[] = [];

  // Phase 1: Upload all files in parallel
  console.log(`[CloudPreprocess] 📤 Uploading ${files.length} files...`);
  const fileUrls: string[] = [];
  
  await Promise.all(
    files.map(async (file, i) => {
      onProgress?.(i, "uploading", 0);
      const url = await uploadToStorage(file, user.id);
      fileUrls[i] = url;
      onProgress?.(i, "uploading", 100);
      console.log(`[CloudPreprocess] ✅ Uploaded ${file.name}`);
    })
  );

  // Phase 2: Create preprocess assemblies
  console.log(`[CloudPreprocess] ⚡ Creating server-side normalization...`);
  const createRes = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "preprocess",
      fileUrls,
      resolution: settings.resolution,
      videoFormat: settings.videoFormat || "9:16",
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error || `Preprocess creation failed: ${createRes.status}`);
  }

  const createData = await createRes.json();
  if (createData?.ok === false || createData?.fallback === true) {
    throw new Error(getCloudPreprocessError(createData));
  }
  const { assemblies } = createData;

  // Phase 3: Poll all assemblies in parallel
  console.log(`[CloudPreprocess] 🔄 Waiting for ${assemblies.length} normalizations...`);
  
  const pollPromises = assemblies.map(
    async (a: { assemblyId: string; fileIndex: number }) => {
      const file = files[a.fileIndex];
      onProgress?.(a.fileIndex, "processing", 10);

      const resultUrl = await pollPreprocessAssembly(a.assemblyId, (pct) => {
        onProgress?.(a.fileIndex, "processing", pct);
      });

      // Phase 4: Download normalized file
      onProgress?.(a.fileIndex, "downloading", 0);
      console.log(`[CloudPreprocess] 📥 Downloading normalized ${file.name}...`);
      const normalizedFile = await downloadNormalizedFile(resultUrl, file.name);
      onProgress?.(a.fileIndex, "done", 100);

      console.log(`[CloudPreprocess] ✅ ${file.name} normalized (${(normalizedFile.size / 1024 / 1024).toFixed(1)}MB)`);

      return { originalFile: file, normalizedFile };
    }
  );

  const allResults = await Promise.all(pollPromises);
  results.push(...allResults);

  console.log(`[CloudPreprocess] 🎉 All ${results.length} files normalized on server!`);
  return results;
}
