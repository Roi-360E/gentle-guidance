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

async function getVideoApiConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data } = await supabase
    .from("admin_settings")
    .select("key, value")
    .in("key", ["video_api_provider", "video_api_key"]);

  const config: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    config[row.key] = row.value;
  });

  return {
    provider: config["video_api_provider"] || "lovable_ai",
    apiKey: config["video_api_key"] || "",
  };
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

async function generateWithRunway(scenes: any[], apiKey: string, aspect: string) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      // Runway Gen-3 Alpha Turbo API
      const res = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
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
      });

      if (!res.ok) {
        console.error("Runway error:", res.status, await res.text());
        results.push(null);
        continue;
      }

      const data = await res.json();
      // Runway returns a task ID - poll for result
      const taskId = data.id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
        });
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

async function generateWithMinimax(scenes: any[], apiKey: string) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await fetch("https://api.minimaxi.chat/v1/video_generation", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "video-01",
          prompt: scene.image_prompt || scene.description || "cinematic video scene",
        }),
      });

      if (!res.ok) {
        console.error("Minimax error:", res.status, await res.text());
        results.push(null);
        continue;
      }

      const data = await res.json();
      const taskId = data.task_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.minimaxi.chat/v1/query/video_generation?task_id=${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
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

async function generateWithKling(scenes: any[], apiKey: string) {
  const results: (string | null)[] = [];
  for (const scene of scenes.slice(0, 4)) {
    try {
      const res = await fetch("https://api.klingai.com/v1/videos/text2video", {
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
      });

      if (!res.ok) {
        console.error("Kling error:", res.status, await res.text());
        results.push(null);
        continue;
      }

      const data = await res.json();
      const taskId = data.data?.task_id;
      let videoUrl: string | null = null;

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
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

    // Get video API config from admin settings
    const videoConfig = await getVideoApiConfig();
    console.log(`Video provider: ${videoConfig.provider}`);

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

    // Step 2: Generate visuals based on provider
    const scenes = creative.scenes || [];
    let sceneMedia: (string | null)[] = [];
    let mediaType: "image" | "video" = "image";

    console.log(`Step 2: Generating ${scenes.length} scenes with ${videoConfig.provider}...`);

    if (videoConfig.provider === "lovable_ai" || !videoConfig.apiKey) {
      // Default: generate images with Lovable AI
      sceneMedia = await generateWithLovableAI(scenes, aspect, LOVABLE_API_KEY);
      mediaType = "image";
    } else if (videoConfig.provider === "runway") {
      sceneMedia = await generateWithRunway(scenes, videoConfig.apiKey, aspect);
      mediaType = "video";
    } else if (videoConfig.provider === "minimax") {
      sceneMedia = await generateWithMinimax(scenes, videoConfig.apiKey);
      mediaType = "video";
    } else if (videoConfig.provider === "kling") {
      sceneMedia = await generateWithKling(scenes, videoConfig.apiKey);
      mediaType = "video";
    } else {
      // Fallback to Lovable AI images
      sceneMedia = await generateWithLovableAI(scenes, aspect, LOVABLE_API_KEY);
      mediaType = "image";
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
    creative.provider = videoConfig.provider;
    creative.has_generated_images = sceneMedia.some((m) => m !== null);

    console.log(`Done! Generated ${sceneMedia.filter(Boolean).length}/${scenes.length} media items via ${videoConfig.provider}.`);

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
