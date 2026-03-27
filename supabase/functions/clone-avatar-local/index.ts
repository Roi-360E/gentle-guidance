import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    console.log(`[clone-avatar-local] user=${user.id}, face=${faceImage.name} (${faceImage.size}), audio=${audioFile?.name || 'none'}, prompt="${prompt.substring(0, 50)}"`);

    // Convert face image to base64 for AI processing
    const faceBytes = new Uint8Array(await faceImage.arrayBuffer());
    const faceBase64 = btoa(String.fromCharCode(...faceBytes));
    const faceMime = faceImage.type || "image/jpeg";

    // Convert audio to base64 if provided
    let audioBase64: string | null = null;
    let audioMime: string | null = null;
    if (audioFile) {
      const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
      audioBase64 = btoa(String.fromCharCode(...audioBytes));
      audioMime = audioFile.type || "audio/wav";
    }

    // Step 1: Use Lovable AI Gateway to generate a script based on face + prompt
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a detailed script analyzing the face image
    const scriptPrompt = `Analise esta imagem de rosto e crie um roteiro detalhado para um vídeo avatar/talking head.

Prompt do usuário: "${prompt || 'Criar um vídeo com avatar falando'}"
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

    const scriptMessages = [
      {
        role: "user",
        content: [
          { type: "text", text: scriptPrompt },
          {
            type: "image_url",
            image_url: { url: `data:${faceMime};base64,${faceBase64}` },
          },
        ],
      },
    ];

    console.log("[clone-avatar-local] Generating script via AI...");
    const scriptResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: scriptMessages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!scriptResponse.ok) {
      const errText = await scriptResponse.text();
      console.error("[clone-avatar-local] Script generation failed:", errText);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar roteiro do avatar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptResult = await scriptResponse.json();
    const rawScript = scriptResult.choices?.[0]?.message?.content || "";
    console.log("[clone-avatar-local] Raw script:", rawScript.substring(0, 200));

    // Parse the script JSON
    let parsedScript: any;
    try {
      const jsonMatch = rawScript.match(/\{[\s\S]*\}/);
      parsedScript = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Avatar Video", script_text: rawScript, scenes: [] };
    } catch {
      parsedScript = { title: "Avatar Video", script_text: rawScript, scenes: [] };
    }

    // Step 2: Generate avatar scene images using the face as reference
    console.log("[clone-avatar-local] Generating avatar scene images...");
    const scenes = parsedScript.scenes || [];
    const generatedScenes = [];

    for (let i = 0; i < Math.min(scenes.length, 4); i++) {
      const scene = scenes[i];
      const imagePrompt = `Generate a photorealistic image of the person from the reference photo in this scene:
Scene: ${scene.description || "Person talking to camera"}
Expression: ${scene.expression || "natural"}
Camera: ${scene.camera_angle || "close-up"}
Style: Professional video frame, ${aspect} aspect ratio, cinematic lighting.
The person should look exactly like the reference photo.`;

      try {
        const imageResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: imagePrompt },
                  {
                    type: "image_url",
                    image_url: { url: `data:${faceMime};base64,${faceBase64}` },
                  },
                ],
              },
            ],
            temperature: 0.8,
            max_tokens: 1000,
          }),
        });

        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          const content = imageResult.choices?.[0]?.message?.content || "";
          // Extract base64 image from response if present
          const imgMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
          
          generatedScenes.push({
            ...scene,
            scene_number: i + 1,
            generated_image: imgMatch ? imgMatch[0] : null,
            dialogue: scene.dialogue || "",
          });
          console.log(`[clone-avatar-local] Scene ${i + 1} generated, has_image=${!!imgMatch}`);
        } else {
          const errText = await imageResponse.text();
          console.error(`[clone-avatar-local] Scene ${i + 1} image failed:`, errText);
          generatedScenes.push({ ...scene, scene_number: i + 1, generated_image: null });
        }
      } catch (err) {
        console.error(`[clone-avatar-local] Scene ${i + 1} error:`, err);
        generatedScenes.push({ ...scene, scene_number: i + 1, generated_image: null });
      }
    }

    const result = {
      creative: {
        title: parsedScript.title || "Avatar Video",
        script: parsedScript.script_text || "",
        scenes: generatedScenes,
        total_duration: parsedScript.total_duration_seconds || 30,
        style_notes: parsedScript.style_notes || "",
        has_audio: !!audioFile,
        audio_filename: audioFile?.name || null,
        aspect,
      },
    };

    console.log(`[clone-avatar-local] Done! ${generatedScenes.length} scenes generated`);

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
