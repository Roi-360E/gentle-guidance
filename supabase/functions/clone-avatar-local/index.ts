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

    // Accept multipart form data with face image and audio
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

    console.log(`[clone-avatar-local] user=${user.id}, face=${faceImage.name} (${faceImage.size}), audio=${audioFile?.name || "none"}, prompt="${prompt.substring(0, 50)}"`);

    // Convert face image to base64 for AI script generation
    const faceBytes = new Uint8Array(await faceImage.arrayBuffer());
    const faceBase64 = btoa(String.fromCharCode(...faceBytes));
    const faceMime = faceImage.type || "image/jpeg";

    // ── Step 1: Generate script via Lovable AI ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptPrompt = `Analise esta imagem de rosto e crie um roteiro detalhado para um vídeo avatar/talking head.

Prompt do usuário: "${prompt || "Criar um vídeo com avatar falando"}"
Proporção: ${aspect}

Retorne um JSON com esta estrutura:
{
  "title": "título do vídeo",
  "script_text": "texto completo que o avatar deve falar",
  "scenes": [
    {
      "scene_number": 1,
      "description": "descrição visual da cena",
      "dialogue": "fala do avatar nesta cena",
      "duration_seconds": 5,
      "camera_angle": "close-up / meio-corpo",
      "expression": "sorriso / sério / entusiasta"
    }
  ],
  "style_notes": "notas sobre o estilo visual",
  "total_duration_seconds": 30
}

IMPORTANTE: Retorne APENAS o JSON, sem markdown.`;

    console.log("[clone-avatar-local] Generating script via AI...");
    const scriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
      console.error("[clone-avatar-local] Script generation failed:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Falha ao gerar roteiro do avatar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptResult = await scriptResponse.json();
    const rawScript = scriptResult.choices?.[0]?.message?.content || "";
    console.log("[clone-avatar-local] Raw script:", rawScript.substring(0, 200));

    let parsedScript: any;
    try {
      const jsonMatch = rawScript.match(/\{[\s\S]*\}/);
      parsedScript = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Avatar Video", script_text: rawScript, scenes: [] };
    } catch {
      parsedScript = { title: "Avatar Video", script_text: rawScript, scenes: [] };
    }

    // ── Step 2: Upload face image + audio to VPS temp folder ──
    console.log("[clone-avatar-local] Uploading files to VPS...");
    const vpsFormData = new FormData();
    vpsFormData.append("face_image", faceImage, faceImage.name);
    if (audioFile) {
      vpsFormData.append("audio", audioFile, audioFile.name);
    }
    vpsFormData.append("user_id", user.id);
    vpsFormData.append("script", JSON.stringify(parsedScript));

    let vpsResult: any = null;
    try {
      const vpsResp = await fetch(`${VPS_BASE}/save-avatar-assets`, {
        method: "POST",
        body: vpsFormData,
      });

      if (vpsResp.ok) {
        vpsResult = await vpsResp.json();
        console.log("[clone-avatar-local] VPS save result:", JSON.stringify(vpsResult));
      } else {
        const vpsErr = await vpsResp.text();
        console.error("[clone-avatar-local] VPS save failed:", vpsResp.status, vpsErr);
        vpsResult = { error: vpsErr, saved: false };
      }
    } catch (vpsErr) {
      console.error("[clone-avatar-local] VPS connection error:", vpsErr);
      vpsResult = { error: "VPS indisponível", saved: false };
    }

    // ── Return script + VPS status ──
    const result = {
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
      vps: vpsResult,
    };

    console.log(`[clone-avatar-local] Done! Script with ${parsedScript.scenes?.length || 0} scenes, VPS saved=${vpsResult?.saved ?? false}`);

    return new Response(JSON.stringify(result), {
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
