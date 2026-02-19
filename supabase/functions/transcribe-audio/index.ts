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
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const base64Audio = base64Encode(audioBytes);
    const mimeType = audioFile.type || "audio/wav";

    // Call Gemini for transcription with timestamps
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
                  text: `Transcribe this audio into segments. For each segment of speech, provide the start time, end time, and text.

IMPORTANT RULES:
- Detect the language automatically
- Split into natural sentence segments (3-8 seconds each)
- Timestamps must be accurate to the audio
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
      JSON.stringify({ error: error.message || "Transcription failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
