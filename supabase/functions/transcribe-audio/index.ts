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

    const transcriptionPrompt = `You are a precision subtitle transcriber. Transcribe this audio into tightly-timed segments.

CRITICAL TIMING RULES:
- Each segment MUST start exactly when the speaker begins that phrase and end exactly when they finish.
- Do NOT pad or round timestamps — use millisecond precision (e.g. 1.240, 3.871).
- Split into SHORT segments of 1-4 seconds each (max 8 words per segment).
- There must be NO gap between the end of one segment and the start of the next IF speech is continuous.
- Silence gaps between phrases must be reflected: the previous segment ends when speech stops, the next starts when speech resumes.
- Detect the language automatically.
- Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON format:
{
  "language": "pt",
  "segments": [
    {"start": 0.120, "end": 1.450, "text": "Olá tudo bem"},
    {"start": 1.480, "end": 3.210, "text": "hoje vamos falar sobre"},
    {"start": 3.250, "end": 5.870, "text": "como fazer legendas perfeitas"}
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
