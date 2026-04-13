import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "Nenhum áudio enviado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const base64Audio = base64Encode(audioBytes as unknown as ArrayBuffer);
    const mimeType = audioFile.type || "audio/webm";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Audio}`,
                },
              },
              {
                type: "text",
                text: `Transcreva este áudio para texto em português brasileiro.

REGRAS IMPORTANTES:
- Retorne APENAS o texto falado, sem aspas, sem prefixos, sem explicações
- Mantenha a pontuação natural
- Se houver termos técnicos ou nomes próprios, transcreva da forma mais fiel possível
- Se não entender alguma parte, escreva [inaudível]
- NÃO invente palavras ou frases que não foram ditas
- Seja 100% fiel ao que foi falado no áudio`,
              },
            ],
          },
        ],
        temperature: 0.05,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao transcrever áudio" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    if (!text) {
      return new Response(JSON.stringify({ error: "Não foi possível entender o áudio" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chat-transcribe error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Erro na transcrição" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
