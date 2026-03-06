import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pixel_id, access_token, pixel_name, test_event_code } = await req.json();

    if (!pixel_id || !access_token) {
      return new Response(JSON.stringify({ error: "pixel_id e access_token são obrigatórios" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use provided test event code or generate one
    const testEventCode = test_event_code || ("TEST" + crypto.randomUUID().replace(/-/g, "").substring(0, 10).toUpperCase());

    // Hash test email
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode("test@escalaxpro.com"));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedEmail = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const eventPayload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data: { em: [hashedEmail] },
          custom_data: {
            value: 1.0,
            currency: "BRL",
            content_name: "Compra Teste - " + (pixel_name || "Pixel"),
            content_type: "product",
          },
        },
      ],
      test_event_code: testEventCode,
    };

    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${pixel_id}/events?access_token=${access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventPayload),
      }
    );

    const fbResult = await fbRes.json();

    if (fbResult.error) {
      return new Response(
        JSON.stringify({ error: fbResult.error.message, test_event_code: testEventCode }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        test_event_code: testEventCode,
        events_received: fbResult.events_received,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
