import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { text, voiceId } = await req.json();

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY não configurada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Texto vazio" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- TTS Credit validation ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user from auth header
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    let userId: string | null = null;

    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    if (userId) {
      const monthYear = new Date().toISOString().substring(0, 7);
      const { data: usage } = await supabase
        .from("video_usage")
        .select("id, tts_credits, plan")
        .eq("user_id", userId)
        .eq("month_year", monthYear)
        .single();

      if (!usage || usage.tts_credits <= 0) {
        return new Response(
          JSON.stringify({ error: "Créditos TTS esgotados. Faça upgrade ou aguarde a renovação." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Debit 1 TTS credit before generating
      await supabase
        .from("video_usage")
        .update({ tts_credits: usage.tts_credits - 1 })
        .eq("id", usage.id);
    }

    // Default to Roger voice
    const selectedVoice = voiceId || "CwhRBWXzGAHq8TQ4Fs17";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}/stream?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.slice(0, 4500),
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.15,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs error:", response.status, errorText);

      // Refund credit on failure
      if (userId) {
        const monthYear = new Date().toISOString().substring(0, 7);
        const { data: usage } = await supabase
          .from("video_usage")
          .select("id, tts_credits")
          .eq("user_id", userId)
          .eq("month_year", monthYear)
          .single();
        if (usage) {
          await supabase
            .from("video_usage")
            .update({ tts_credits: usage.tts_credits + 1 })
            .eq("id", usage.id);
        }
      }

      return new Response(
        JSON.stringify({ error: `Erro ElevenLabs: ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the audio back
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e) {
    console.error("elevenlabs-tts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
