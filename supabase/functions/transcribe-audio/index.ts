/**
 * transcribe-audio — Transcrição ultra-rápida via Gemini
 * 
 * Aceita vídeo ou áudio diretamente via FormData.
 * O Gemini processa o arquivo nativamente sem necessidade
 * de extração de áudio no cliente, reduzindo o tempo total
 * para < 3 segundos por vídeo.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    // Aceita tanto "audio" quanto "video" como campo do FormData
    const mediaFile = (formData.get("video") || formData.get("audio")) as File;

    if (!mediaFile) {
      return new Response(JSON.stringify({ error: "No media file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaBytes = new Uint8Array(await mediaFile.arrayBuffer());
    const base64Media = base64Encode(mediaBytes as unknown as ArrayBuffer);
    // Detectar MIME automaticamente (video/mp4, audio/wav, etc.)
    const mimeType = mediaFile.type || "audio/wav";

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Gemini 2.5 Flash processa vídeo/áudio nativamente com timestamps
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
                    data: base64Media,
                  },
                },
                {
                  text: `Transcribe this media into segments. For each segment of speech, provide the start time, end time, and text.

IMPORTANT RULES:
- Detect the language automatically
- Split into natural sentence segments (3-8 seconds each)
- Timestamps must be accurate to the audio/video
- Return ONLY valid JSON, no markdown

Return this exact JSON format:
{
  "language": "pt",
  "segments": [
    {"start": 0.0, "end": 3.5, "text": "Olá, tudo bem?"},
    {"start": 3.8, "end": 7.2, "text": "Hoje vamos falar sobre..."}
  ]
}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseErr) {
      console.error("Parse error:", parseErr, "Raw:", textContent);
      throw new Error("Failed to parse transcription response");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Transcription failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
