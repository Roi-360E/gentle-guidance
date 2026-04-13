/**
 * transcribe-audio — Transcrição via Lovable AI Gateway
 * 
 * Aceita áudio via FormData, converte para base64 e envia ao
 * Lovable AI Gateway (Gemini) para transcrição com timestamps.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();

    const audioFile = formData.get("audio") as File | null;
    const videoFile = formData.get("video") as File | null;

    if (!audioFile && videoFile) {
      return jsonResponse(
        {
          code: "VIDEO_PAYLOAD_NOT_ALLOWED",
          message: "Send extracted audio in the 'audio' field to avoid worker memory limits.",
        },
        413,
      );
    }

    const mediaFile = audioFile;
    if (!mediaFile) {
      return jsonResponse({ error: "No audio file provided" }, 400);
    }

    const maxBytes = 8 * 1024 * 1024;
    if (mediaFile.size > maxBytes) {
      return jsonResponse(
        {
          code: "AUDIO_TOO_LARGE",
          message: "Audio payload too large. Keep audio under 8MB.",
        },
        413,
      );
    }

    const mediaBytes = new Uint8Array(await mediaFile.arrayBuffer());
    const base64Media = base64Encode(mediaBytes as unknown as ArrayBuffer);
    const mimeType = mediaFile.type || "audio/wav";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const transcriptionPrompt = `Transcribe this media into segments. For each segment of speech, provide the start time, end time, and text.

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
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
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
                  url: `data:${mimeType};base64,${base64Media}`,
                },
              },
              {
                type: "text",
                text: transcriptionPrompt,
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      if (response.status === 429) {
        return jsonResponse({ error: "Rate limit exceeded, please try again later." }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ error: "AI credits exhausted." }, 402);
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || "";

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

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Transcription error:", error);
    return jsonResponse({ error: (error as Error).message || "Transcription failed" }, 500);
  }
});
