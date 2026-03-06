import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { verification_code } = await req.json();

    if (!verification_code || typeof verification_code !== "string") {
      return new Response(
        JSON.stringify({ error: "verification_code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the verification code in a simple key-value style
    // We'll use facebook_pixel_config table with a special name
    const { error: upsertError } = await supabase
      .from("facebook_pixel_config")
      .upsert(
        {
          name: "__domain_verification__",
          pixel_id: "domain-verify",
          pixel_snippet: `<meta name="facebook-domain-verification" content="${verification_code}" />`,
          access_token: "",
          dedup_key: "",
          is_active: true,
        },
        { onConflict: "name" }
      );

    // Note: if onConflict on name doesn't work, we do manual check
    if (upsertError) {
      // Try delete + insert
      await supabase
        .from("facebook_pixel_config")
        .delete()
        .eq("name", "__domain_verification__");

      const { error: insertError } = await supabase
        .from("facebook_pixel_config")
        .insert({
          name: "__domain_verification__",
          pixel_id: "domain-verify",
          pixel_snippet: `<meta name="facebook-domain-verification" content="${verification_code}" />`,
          access_token: "",
          dedup_key: "",
          is_active: true,
        });

      if (insertError) {
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ success: true, verification_code }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
