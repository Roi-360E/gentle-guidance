import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UGC_ASPECTS = [
  "Pessoa real falando diretamente para a câmera (talking head)",
  "Iluminação natural e cenário casual/autêntico (quarto, cozinha, escritório)",
  "Enquadramento close-up ou meio-corpo para conexão pessoal",
  "Movimentos de câmera orgânicos (leve tremor, zoom suave)",
  "Texto overlay com fontes modernas e cores vibrantes",
  "Transições rápidas e dinâmicas (jump cuts, zoom transitions)",
  "Legendas automáticas em estilo TikTok/Reels",
  "Hook forte nos primeiros 3 segundos",
  "CTA claro e direto no final",
  "Música de fundo trending ou som original",
  "Demonstração do produto em uso real",
  "Depoimento autêntico com emoção genuína",
  "Storytelling pessoal (antes/depois, problema/solução)",
  "Efeitos nativos da plataforma (filtros, stickers, polls)",
  "Duração ideal entre 15-60 segundos",
];

interface ApiKeyRow {
  id: string;
  provider: string;
  api_key: string;
  label: string;
  is_enabled: boolean;
  fail_count: number;
}

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

async function getProxyApiKey(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "proxy_api_key")
    .single();
  return data?.value || null;
}

/**
 * Proxied fetch: if a proxy API key is configured (ScraperAPI-style),
 * routes the request through the proxy with rotating IPs.
 * Each call gets a different IP, making each API key appear as a different app.
 */
async function proxiedFetch(
  url: string,
  options: RequestInit,
  proxyKey: string | null
): Promise<Response> {
  if (!proxyKey) {
    return fetch(url, options);
  }

  // ScraperAPI-style proxy: route through proxy URL with rotating session
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const proxyUrl = `http://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(url)}&session_number=${sessionId}&render=false`;

  console.log(`[Proxy] Routing through proxy with session ${sessionId}`);
  return fetch(proxyUrl, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
  });
}

async function getAllApiKeys(): Promise<ApiKeyRow[]> {
  const supabase = getSupabaseAdmin();

  const { data: keysData } = await supabase
    .from("video_api_keys")
    .select("id, provider, api_key, label, is_enabled, fail_count")
    .eq("is_enabled", true)
    .order("fail_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true });

  return keysData || [];
}

async function markKeyFailed(keyId: string, error: string, isCreditsExhausted = false) {
  if (keyId === "legacy") return;
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("video_api_keys")
    .select("fail_count")
    .eq("id", keyId)
    .single();
  const newCount = (existing?.fail_count || 0) + 1;

  // Auto-disable key if credits are exhausted or too many failures (5+)
  const shouldDisable = isCreditsExhausted || newCount >= 5;
  const updatePayload: Record<string, any> = {
    fail_count: newCount,
    last_error: isCreditsExhausted ? `⚠️ CRÉDITOS ESGOTADOS: ${error}` : error,
    last_used_at: new Date().toISOString(),
  };
  if (shouldDisable) {
    updatePayload.is_enabled = false;
    console.log(`[Auto-disable] Key ${keyId} disabled: ${isCreditsExhausted ? 'credits exhausted' : 'too many failures'}`);
  }

  await supabase
    .from("video_api_keys")
    .update(updatePayload)
    .eq("id", keyId);
}

/**
 * Detects if an HTTP error response indicates credit/quota exhaustion.
 */
function isCreditsError(status: number, body: string): boolean {
  if (status === 402 || status === 403) return true;
  if (status === 429) {
    const lower = body.toLowerCase();
    if (lower.includes("quota") || lower.includes("limit") || lower.includes("credit") || lower.includes("balance") || lower.includes("exceeded")) {
      return true;
    }
  }
  const lower = body.toLowerCase();
  return (
    lower.includes("insufficient") ||
    lower.includes("no credits") ||
    lower.includes("quota exceeded") ||
    lower.includes("balance") ||
    lower.includes("payment required")
  );
}

async function markKeyUsed(keyId: string) {
  if (keyId === "legacy") return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("video_api_keys")
    .update({ last_used_at: new Date().toISOString(), last_error: null })
    .eq("id", keyId);
}

async function generateWithLovableAI(
  scenes: any[],
  aspect: string,
  LOVABLE_API_KEY: string
) {
  const aspectMap: Record<string, string> = {
    "9:16 (Vertical)": "vertical 9:16 aspect ratio, portrait mode",
    "16:9 (Horizontal)": "horizontal 16:9 aspect ratio, landscape mode",
    "1:1 (Feed)": "square 1:1 aspect ratio",
  };
  const aspectSuffix = aspectMap[aspect] || "vertical 9:16 aspect ratio";

  const imagePromises = scenes.slice(0, 4).map(async (scene: any, idx: number) => {
    const imgPrompt = scene.image_prompt || scene.description || `Scene ${idx + 1}`;
    const fullPrompt = `${imgPrompt}, ${aspectSuffix}, high quality, professional social media ad, cinematic lighting, vibrant colors`;

    try {
      const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!imgResponse.ok) return null;
      const imgData = await imgResponse.json();
      return imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
    } catch {
      return null;
    }
  });

  return Promise.all(imagePromises);
}

async function generateWithRunway(scenes: any[], apiKey: string, aspect: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      // Runway Gen-3 Alpha Turbo API
      const res = await proxiedFetch("https://api.dev.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify({
          model: "gen3a_turbo",
          promptText: scene.image_prompt || scene.description || "cinematic video scene",
          duration: 5,
          ratio: aspect?.includes("16:9") ? "16:9" : "9:16",
        }),
      }, proxyKey);

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Runway error:", res.status, errBody);
        if (isCreditsError(res.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: Runway ${res.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const data = await res.json();
      // Runway returns a task ID - poll for result
      const taskId = data.id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.status === "SUCCEEDED") {
          videoUrl = pollData.output?.[0];
          break;
        }
        if (pollData.status === "FAILED") break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("Runway gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithMinimax(scenes: any[], apiKey: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await proxiedFetch("https://api.minimaxi.chat/v1/video_generation", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "video-01",
          prompt: scene.image_prompt || scene.description || "cinematic video scene",
        }),
      }, proxyKey);

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Minimax error:", res.status, errBody);
        if (isCreditsError(res.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: Minimax ${res.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const data = await res.json();
      const taskId = data.task_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.minimaxi.chat/v1/query/video_generation?task_id=${taskId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.status === "Success") {
          videoUrl = pollData.file_id ? `https://api.minimaxi.chat/v1/files/retrieve?file_id=${pollData.file_id}` : null;
          break;
        }
        if (pollData.status === "Fail") break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("Minimax gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithKling(scenes: any[], apiKey: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await proxiedFetch("https://api.klingai.com/v1/videos/text2video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_name: "kling-v1",
          prompt: scene.image_prompt || scene.description || "cinematic video scene",
          duration: "5",
          aspect_ratio: "9:16",
        }),
      }, proxyKey);

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Kling error:", res.status, errBody);
        if (isCreditsError(res.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: Kling ${res.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const data = await res.json();
      const taskId = data.data?.task_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.data?.task_status === "succeed") {
          videoUrl = pollData.data?.task_result?.videos?.[0]?.url;
          break;
        }
        if (pollData.data?.task_status === "failed") break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("Kling gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithLuma(scenes: any[], apiKey: string, aspect: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await proxiedFetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: scene.image_prompt || scene.description || "cinematic video scene",
          aspect_ratio: aspect?.includes("16:9") ? "16:9" : "9:16",
          loop: false,
        }),
      }, proxyKey);

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Luma error:", res.status, errBody);
        if (isCreditsError(res.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: Luma ${res.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const data = await res.json();
      const genId = data.id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${genId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.state === "completed") {
          videoUrl = pollData.assets?.video;
          break;
        }
        if (pollData.state === "failed") break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("Luma gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithStability(scenes: any[], apiKey: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const imgRes = await proxiedFetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        body: (() => {
          const fd = new FormData();
          fd.append("prompt", scene.image_prompt || scene.description || "cinematic scene");
          fd.append("output_format", "png");
          fd.append("aspect_ratio", "9:16");
          return fd;
        })(),
      }, proxyKey);

      if (!imgRes.ok) {
        const errBody = await imgRes.text();
        console.error("Stability img error:", imgRes.status, errBody);
        if (isCreditsError(imgRes.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: Stability ${imgRes.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const imgData = await imgRes.json();
      const imageBase64 = imgData.image;
      if (!imageBase64) { results.push(null); continue; }

      const vidFormData = new FormData();
      const imageBlob = new Blob([Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))], { type: "image/png" });
      vidFormData.append("image", imageBlob, "scene.png");
      vidFormData.append("cfg_scale", "2.5");
      vidFormData.append("motion_bucket_id", "127");

      const vidRes = await proxiedFetch("https://api.stability.ai/v2beta/image-to-video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: vidFormData,
      }, proxyKey);

      if (!vidRes.ok) {
        console.error("Stability vid error:", vidRes.status, await vidRes.text());
        results.push(`data:image/png;base64,${imageBase64}`);
        continue;
      }

      const vidData = await vidRes.json();
      const generationId = vidData.id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.stability.ai/v2beta/image-to-video/result/${generationId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        }, proxyKey);
        if (pollRes.status === 200) {
          const pollData = await pollRes.json();
          videoUrl = pollData.video ? `data:video/mp4;base64,${pollData.video}` : null;
          break;
        }
        if (pollRes.status !== 202) break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("Stability gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithHeygen(scenes: any[], apiKey: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await proxiedFetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_inputs: [{
            character: {
              type: "avatar",
              avatar_id: "Angela-inblackskirt-20220820",
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: scene.text_overlay || scene.description || "Hello!",
              voice_id: "1bd001e7e50f421d891986aad5158bc8",
            },
          }],
          dimension: { width: 1080, height: 1920 },
        }),
      }, proxyKey);

      if (!res.ok) {
        const errBody = await res.text();
        console.error("HeyGen error:", res.status, errBody);
        if (isCreditsError(res.status, errBody)) {
          throw new Error(`CREDITS_EXHAUSTED: HeyGen ${res.status} - ${errBody.slice(0, 100)}`);
        }
        results.push(null);
        continue;
      }

      const data = await res.json();
      const videoId = data.data?.video_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          method: "GET",
          headers: { "X-Api-Key": apiKey },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.data?.status === "completed") {
          videoUrl = pollData.data?.video_url;
          break;
        }
        if (pollData.data?.status === "failed") break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("HeyGen gen error:", err);
      results.push(null);
    }
  }
  return results;
}

async function generateWithPixverse(scenes: any[], apiKey: string, proxyKey: string | null) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await proxiedFetch("https://app-api.pixverse.ai/openapi/v2/video/text/generate", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: scene.image_prompt || scene.description || "cinematic video scene",
          duration: 4,
          quality: "high",
          aspect_ratio: "9:16",
          model: "v3.5",
        }),
      }, proxyKey);

      if (!res.ok) {
        console.error("PixVerse error:", res.status, await res.text());
        results.push(null);
        continue;
      }

      const data = await res.json();
      const taskId = data.Resp?.task_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await proxiedFetch(`https://app-api.pixverse.ai/openapi/v2/video/result/${taskId}`, {
          method: "GET",
          headers: { "Api-Key": apiKey },
        }, proxyKey);
        const pollData = await pollRes.json();
        if (pollData.Resp?.status === 1) {
          videoUrl = pollData.Resp?.url;
          break;
        }
        if (pollData.Resp?.status === 3) break;
      }

      results.push(videoUrl);
    } catch (err) {
      console.error("PixVerse gen error:", err);
      results.push(null);
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, model, aspect, imageDescriptions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get ALL enabled API keys and proxy config
    const [allKeys, proxyKey] = await Promise.all([getAllApiKeys(), getProxyApiKey()]);
    console.log(`Total keys in pool: ${allKeys.length} across providers: ${[...new Set(allKeys.map(k => k.provider))].join(', ') || 'none'}`);
    if (proxyKey) console.log("[Proxy] Proxy API key configured — requests will be routed with rotating IPs");

    const isUGC = model?.toLowerCase().includes("ugc");

    // Step 1: Generate the script/creative plan (always uses Lovable AI)
    let systemPrompt = `Você é um diretor criativo especialista em produção de vídeos para redes sociais. 
Sua tarefa é gerar um roteiro detalhado e direção criativa completa para um vídeo baseado nas imagens e prompt fornecidos.

Responda SEMPRE em português brasileiro.

Retorne um JSON com a seguinte estrutura:
{
  "title": "Título do criativo",
  "script": "Roteiro completo cena a cena",
  "scenes": [
    {
      "number": 1,
      "duration": "3s",
      "description": "Descrição visual detalhada da cena",
      "text_overlay": "Texto que aparece na tela",
      "transition": "Tipo de transição",
      "image_prompt": "Prompt detalhado em inglês para gerar a imagem/vídeo desta cena."
    }
  ],
  "music_suggestion": "Sugestão de música/áudio",
  "total_duration": "Duração total estimada",
  "creative_notes": "Notas criativas adicionais"
}

IMPORTANTE: Cada cena DEVE ter um campo "image_prompt" em inglês. Limite a 3-5 cenas.`;

    if (isUGC) {
      systemPrompt += `\n\nEste é um criativo no estilo UGC (User Generated Content). 
Aplique TODOS os seguintes aspectos essenciais:

${UGC_ASPECTS.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Para os image_prompts, use estilo: "smartphone selfie style, natural lighting, casual authentic setting, UGC content creator style"`;
    }

    const userMessage = `Modelo: ${model || "Geral"}
Aspecto: ${aspect || "9:16 (Vertical)"}
Prompt do usuário: ${prompt || "Criar um criativo impactante"}
${imageDescriptions?.length ? `\nImagens conectadas (${imageDescriptions.length}):\n${imageDescriptions.map((d: string, i: number) => `- Imagem ${i + 1}: ${d}`).join("\n")}` : "Nenhuma imagem conectada."}

Gere o roteiro criativo completo com image_prompts para cada cena. Limite a no máximo 4 cenas.`;

    console.log("Step 1: Generating script...");
    const scriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!scriptResponse.ok) {
      if (scriptResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (scriptResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await scriptResponse.text();
      console.error("AI gateway error:", scriptResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar roteiro com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptData = await scriptResponse.json();
    const content = scriptData.choices?.[0]?.message?.content || "";

    let creative: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        creative = JSON.parse(jsonMatch[0]);
      } else {
        creative = { script: content, title: "Criativo Gerado", scenes: [], creative_notes: content };
      }
    } catch {
      creative = { script: content, title: "Criativo Gerado", scenes: [], creative_notes: content };
    }

    if (isUGC) {
      creative.ugc_aspects = UGC_ASPECTS;
    }

    // Step 2: Generate visuals — try ALL keys across ALL providers with failover
    const scenes = creative.scenes || [];
    let sceneMedia: (string | null)[] = [];
    let mediaType: "image" | "video" = "image";
    let usedKeyId = "";
    let usedProvider = "lovable_ai";

    const generateFn: Record<string, (s: any[], k: string) => Promise<(string | null)[]>> = {
      runway: (s, k) => generateWithRunway(s, k, aspect, proxyKey),
      minimax: (s, k) => generateWithMinimax(s, k, proxyKey),
      kling: (s, k) => generateWithKling(s, k, proxyKey),
      luma: (s, k) => generateWithLuma(s, k, aspect, proxyKey),
      stability: (s, k) => generateWithStability(s, k, proxyKey),
      heygen: (s, k) => generateWithHeygen(s, k, proxyKey),
      pixverse: (s, k) => generateWithPixverse(s, k, proxyKey),
    };

    console.log(`Step 2: Generating ${scenes.length} scenes, trying ${allKeys.length} keys...`);

    if (allKeys.length === 0) {
      // No external keys — use Lovable AI
      sceneMedia = await generateWithLovableAI(scenes, aspect, LOVABLE_API_KEY);
      mediaType = "image";
    } else {
      // Try each key across ALL providers until one succeeds
      let succeeded = false;

      for (const keyRow of allKeys) {
        const fn = generateFn[keyRow.provider];
        if (!fn) {
          console.log(`No generator for provider "${keyRow.provider}", skipping key "${keyRow.label}"`);
          continue;
        }

        console.log(`Trying [${keyRow.provider}] key "${keyRow.label || keyRow.id}" (fails: ${keyRow.fail_count})...`);
        try {
          sceneMedia = await fn(scenes, keyRow.api_key);
          const hasResults = sceneMedia.some((m) => m !== null);
          if (hasResults) {
            await markKeyUsed(keyRow.id);
            usedKeyId = keyRow.id;
            usedProvider = keyRow.provider;
            mediaType = "video";
            succeeded = true;
            console.log(`[${keyRow.provider}] Key "${keyRow.label || keyRow.id}" succeeded!`);
            break;
          } else {
            await markKeyFailed(keyRow.id, "No results returned");
            console.log(`[${keyRow.provider}] Key "${keyRow.label || keyRow.id}" returned no results, trying next...`);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await markKeyFailed(keyRow.id, errMsg);
          console.log(`[${keyRow.provider}] Key "${keyRow.label || keyRow.id}" failed: ${errMsg}, trying next...`);
        }
      }

      if (!succeeded) {
        console.log("All keys failed, falling back to Lovable AI images...");
        sceneMedia = await generateWithLovableAI(scenes, aspect, LOVABLE_API_KEY);
        mediaType = "image";
      }
    }

    // Attach media to scenes
    scenes.forEach((scene: any, idx: number) => {
      if (idx < sceneMedia.length && sceneMedia[idx]) {
        if (mediaType === "video") {
          scene.generated_video = sceneMedia[idx];
        } else {
          scene.generated_image = sceneMedia[idx];
        }
      }
    });

    creative.scenes = scenes;
    creative.media_type = mediaType;
    creative.provider = usedProvider;
    creative.has_generated_images = sceneMedia.some((m) => m !== null);
    creative.used_key_id = usedKeyId || null;

    console.log(`Done! Generated ${sceneMedia.filter(Boolean).length}/${scenes.length} media items via ${usedProvider}.`);

    return new Response(JSON.stringify({ creative }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-video-creative error:", e);
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
