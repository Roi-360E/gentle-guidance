import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getVpsBaseUrl(): string | null {
  const directBase = Deno.env.get("VPS_MEDIA_BASE_URL") || Deno.env.get("VPS_BASE_URL");
  if (directBase) return directBase.replace(/\/$/, "");

  const subtitleUrl = Deno.env.get("VPS_SUBTITLE_URL");
  if (!subtitleUrl) return null;
  return subtitleUrl.replace(/\/[^/]*$/, "").replace(/\/$/, "");
}

async function assertAuthenticated(req: Request): Promise<string | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Auth configuration unavailable" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return data.user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await assertAuthenticated(req);
    if (authResult instanceof Response) return authResult;

    const vpsBaseUrl = getVpsBaseUrl();
    if (!vpsBaseUrl) {
      return jsonResponse({ ok: false, error: "VPS not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    return jsonResponse({
      ok: false,
      fallback: true,
      action,
      provider: "integrator-vps-ffmpeg",
      vpsBaseUrlConfigured: true,
      error: "O processamento por Transloadit foi desativado. Use as rotas VPS /preprocess e /concat com FFmpeg.",
    });
  } catch (error) {
    console.error("vps-ffmpeg-compat error:", error);
    return jsonResponse({
      ok: false,
      fallback: true,
      provider: "integrator-vps-ffmpeg",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});