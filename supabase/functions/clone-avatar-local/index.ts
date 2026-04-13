import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VPS_BASE = "https://api.deploysites.online";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseAdmin();
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const faceImage = formData.get("face_image") as File | null;
    const audioFile = formData.get("audio") as File | null;
    const prompt = (formData.get("prompt") as string) || "";
    const aspect = (formData.get("aspect") as string) || "9:16";

    if (!faceImage) {
      return new Response(
        JSON.stringify({ error: "Imagem de rosto é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[clone-avatar-local] user=${user.id}, face=${faceImage.name} (${faceImage.size}), audio=${audioFile?.name || "none"}`);

    // ── Step 1: Generate script via Lovable AI ──
    const faceBytes = new Uint8Array(await faceImage.arrayBuffer());
    const faceBase64 = btoa(String.fromCharCode(...faceBytes));
    const faceMime = faceImage.type || "image/jpeg";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptPrompt = `Analise esta imagem de rosto e crie um roteiro para um vídeo avatar/talking head.

Prompt do usuário: "${prompt || "Criar um vídeo com avatar falando"}"
Proporção: ${aspect}

Retorne APENAS JSON (sem markdown):
{
  "title": "título do vídeo",
  "script_text": "texto completo que o avatar deve falar",
  "scenes": [
    {
      "scene_number": 1,
      "description": "descrição visual",
      "dialogue": "fala do avatar",
      "duration_seconds": 5,
      "camera_angle": "close-up",
      "expression": "sorriso"
    }
  ],
  "style_notes": "notas de estilo",
  "total_duration_seconds": 30
}`;

    console.log("[clone-avatar-local] Generating script...");
    const scriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: scriptPrompt },
              { type: "image_url", image_url: { url: `data:${faceMime};base64,${faceBase64}` } },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!scriptResponse.ok) {
      const status = scriptResponse.status;
      const errText = await scriptResponse.text();
      console.error("[clone-avatar-local] Script failed:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar roteiro" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scriptResult = await scriptResponse.json();
    const rawScript = scriptResult.choices?.[0]?.message?.content || "";

    let parsedScript: any;
    try {
      const jsonMatch = rawScript.match(/\{[\s\S]*\}/);
      parsedScript = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Avatar Video", script_text: rawScript, scenes: [] };
    } catch {
      parsedScript = { title: "Avatar Video", script_text: rawScript, scenes: [] };
    }

    console.log("[clone-avatar-local] Script ready:", parsedScript.title);

    // ── Step 2: Save files to VPS ──
    console.log("[clone-avatar-local] Saving assets to VPS...");
    const vpsFormData = new FormData();
    vpsFormData.append("face_image", faceImage, faceImage.name);
    if (audioFile) {
      vpsFormData.append("audio", audioFile, audioFile.name);
    }
    vpsFormData.append("user_id", user.id);
    vpsFormData.append("script", JSON.stringify(parsedScript));

    const saveResp = await fetch(`${VPS_BASE}/save-avatar-assets`, {
      method: "POST",
      body: vpsFormData,
    });

    if (!saveResp.ok) {
      const errText = await saveResp.text();
      console.error("[clone-avatar-local] VPS save failed:", errText);
      return new Response(JSON.stringify({ error: "Falha ao salvar arquivos na VPS" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saveResult = await saveResp.json();
    const jobId = saveResult.job_id;
    console.log("[clone-avatar-local] Files saved, job_id:", jobId);

    // ── Step 3: Trigger FFmpeg processing (async on VPS) ──
    console.log("[clone-avatar-local] Triggering VPS processing...");
    const processResp = await fetch(`${VPS_BASE}/process-avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });

    const processResult = await processResp.json();
    console.log("[clone-avatar-local] Process triggered:", JSON.stringify(processResult));

    // ── Return immediately with job info ──
    return new Response(JSON.stringify({
      creative: {
        title: parsedScript.title || "Avatar Video",
        script: parsedScript.script_text || "",
        scenes: (parsedScript.scenes || []).map((s: any, i: number) => ({
          ...s,
          scene_number: i + 1,
          generated_image: null,
        })),
        total_duration: parsedScript.total_duration_seconds || 30,
        style_notes: parsedScript.style_notes || "",
        has_audio: !!audioFile,
        audio_filename: audioFile?.name || null,
        aspect,
      },
      job_id: jobId,
      status: "processing",
      status_url: `${VPS_BASE}/avatar-status/${jobId}`,
      download_url: `${VPS_BASE}/avatar-download/${jobId}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[clone-avatar-local] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
