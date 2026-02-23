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

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Audio,
                  },
                },
                {
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
          generationConfig: {
            temperature: 0.05,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao transcrever áudio" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

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
