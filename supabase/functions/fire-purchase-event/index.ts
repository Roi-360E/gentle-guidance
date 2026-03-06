import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { plan_name, plan_value, plan_key, user_id, event_source_url } = body;

    if (!plan_name || !plan_value || !plan_key) {
      return new Response(JSON.stringify({ error: "Missing plan data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active pixel configs
    const { data: pixels } = await supabase
      .from("facebook_pixel_config")
      .select("pixel_id, access_token, dedup_key, name")
      .eq("is_active", true);

    if (!pixels?.length) {
      return new Response(JSON.stringify({ success: false, reason: "No active pixels" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email for matching
    let emHash: string[] = [];
    let externalIdHash: string[] = [];
    if (user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", user_id)
        .single();
      if (profile?.email) {
        emHash = [await sha256(profile.email.toLowerCase().trim())];
      }
      externalIdHash = [await sha256(user_id)];
    }

    const results = [];

    for (const px of pixels) {
      if (!px.pixel_id || !px.access_token) continue;

      const eventId = `${px.dedup_key || "dedup"}_purchase_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;

      const eventPayload = {
        data: [{
          event_name: "Purchase",
          event_id: eventId,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_source_url: event_source_url || "https://deploysites.online/obrigado",
          user_data: {
            em: emHash,
            external_id: externalIdHash,
            client_user_agent: req.headers.get("user-agent") || "",
          },
          custom_data: {
            currency: "BRL",
            value: Number(plan_value),
            content_name: plan_name,
            content_type: "product",
            content_ids: [plan_key],
          },
        }],
      };

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${px.pixel_id}/events?access_token=${px.access_token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventPayload),
        }
      );

      const result = await res.json();
      console.log(`[fire-purchase] ${px.name || px.pixel_id}:`, JSON.stringify(result));
      results.push({ pixel: px.name || px.pixel_id, result });
    }

    // Log to pixel_events_log
    await supabase.from("pixel_events_log").insert({
      event_name: "Purchase",
      event_source: "capi_browser",
      user_id: user_id || null,
      metadata: { plan_name, plan_value, plan_key, results },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fire-purchase] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
