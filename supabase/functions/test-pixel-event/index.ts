import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("test-pixel-event: request received");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("test-pixel-event: no auth header");
      return new Response(JSON.stringify({ error: "Token não fornecido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate token using getUser
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    console.log("test-pixel-event: getUser result", userData?.user?.id, userError?.message);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada. Faça login novamente." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Check admin role using service role client
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData, error: roleError } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    console.log("test-pixel-event: role check", roleData, roleError?.message);

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado. Apenas administradores." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { pixel_id, access_token, pixel_name, test_event_code } = body;
    console.log("test-pixel-event: pixel_id=", pixel_id, "has_token=", !!access_token, "test_code=", test_event_code);

    if (!pixel_id || !access_token) {
      return new Response(JSON.stringify({ error: "pixel_id e access_token são obrigatórios" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const testEventCode = test_event_code || ("TEST" + crypto.randomUUID().replace(/-/g, "").substring(0, 10).toUpperCase());

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
          event_source_url: "https://escalaxpro.com",
          user_data: {
            em: [hashedEmail],
            client_ip_address: "0.0.0.0",
            client_user_agent: "EscalaXPro/TestEvent",
          },
          custom_data: {
            value: 1.0,
            currency: "BRL",
            content_name: "Compra Teste - " + (pixel_name || "Pixel"),
            content_type: "product",
            content_ids: ["test-purchase-001"],
          },
        },
      ],
      test_event_code: testEventCode,
    };

    console.log("test-pixel-event: sending to FB", JSON.stringify(eventPayload));

    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${pixel_id}/events?access_token=${access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventPayload),
      }
    );

    const fbText = await fbRes.text();
    console.log("test-pixel-event: FB response status=", fbRes.status, "body=", fbText.substring(0, 500));

    let fbResult;
    try {
      fbResult = JSON.parse(fbText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Resposta inválida do Facebook: " + fbText.substring(0, 200), test_event_code: testEventCode }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        message: `Evento enviado com sucesso! ${fbResult.events_received || 0} evento(s) recebido(s) pelo Facebook.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("test-pixel-event: caught error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
