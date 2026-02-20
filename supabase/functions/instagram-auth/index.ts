import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { code, action } = body;

    const META_APP_ID = Deno.env.get("META_APP_ID")!;
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Action: disconnect
    if (action === "disconnect") {
      await supabase
        .from("instagram_connections")
        .delete()
        .eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: status — check if connected
    if (action === "status") {
      const { data } = await supabase
        .from("instagram_connections")
        .select("instagram_username, instagram_user_id")
        .eq("user_id", userId)
        .maybeSingle();
      return new Response(
        JSON.stringify({ connected: !!data, connection: data }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Action: exchange code for token
    if (!code) {
      return new Response(
        JSON.stringify({ error: "Authorization code is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const redirectUri = body.redirect_uri;

    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      return new Response(
        JSON.stringify({
          error: "Failed to exchange code",
          details: tokenData.error.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;

    // Step 3: Get user's Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No Facebook Pages found. Your Instagram Business account must be linked to a Facebook Page.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 4: Get Instagram Business Account ID from the first page
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;

    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igData = await igRes.json();

    if (!igData.instagram_business_account) {
      return new Response(
        JSON.stringify({
          error:
            "No Instagram Business/Creator account linked to this Facebook Page. Please convert your Instagram to a Business or Creator account first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const igUserId = igData.instagram_business_account.id;

    // Step 5: Get Instagram username
    const igProfileRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=username&access_token=${pageAccessToken}`
    );
    const igProfile = await igProfileRes.json();

    // Step 6: Calculate token expiry (60 days for long-lived tokens)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Step 7: Upsert connection
    const { error: upsertError } = await supabase
      .from("instagram_connections")
      .upsert(
        {
          user_id: userId,
          instagram_user_id: igUserId,
          instagram_username: igProfile.username || "unknown",
          page_id: page.id,
          page_access_token: pageAccessToken,
          token_expires_at: expiresAt.toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to save connection" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        username: igProfile.username,
        ig_user_id: igUserId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Instagram auth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
