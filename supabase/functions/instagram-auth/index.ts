import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: object) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    // Action: get_app_id — return public app id for frontend OAuth
    if (action === "get_app_id") {
      return jsonResponse({ app_id: META_APP_ID });
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("No auth header");
      return jsonResponse({ error: "Não autenticado. Faça login novamente." });
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("Auth: creating client...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    console.log("Auth: validating token...");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    console.log("Auth result:", { userId: userData?.user?.id, error: userError?.message });
    
    if (userError || !userData?.user) {
      console.error("Auth failed:", userError?.message);
      return jsonResponse({ error: `Autenticação falhou: ${userError?.message || "Usuário não encontrado"}` });
    }
    const userId = userData.user.id;
    console.log("Authenticated:", userId);

    // Action: disconnect
    if (action === "disconnect") {
      await supabase
        .from("instagram_connections")
        .delete()
        .eq("user_id", userId);
      return jsonResponse({ success: true });
    }

    // Action: status — check if connected
    if (action === "status") {
      const { data } = await supabase
        .from("instagram_connections")
        .select("instagram_username, instagram_user_id")
        .eq("user_id", userId)
        .maybeSingle();
      return jsonResponse({ connected: !!data, connection: data });
    }

    // Action: exchange code for token
    if (!code) {
      return jsonResponse({ error: "Código de autorização é obrigatório" });
    }

    const redirectUri = body.redirect_uri;
    console.log("Exchanging code, redirect_uri:", redirectUri);

    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      return jsonResponse({
        error: `Falha na troca do código: ${tokenData.error.message}`,
      });
    }
    console.log("Token exchanged successfully");

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
      return jsonResponse({
        error: "Nenhuma Página do Facebook encontrada. Sua conta Instagram Business precisa estar vinculada a uma Página do Facebook.",
      });
    }

    // Step 4: Get Instagram Business Account ID from the first page
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;

    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igData = await igRes.json();

    if (!igData.instagram_business_account) {
      return jsonResponse({
        error: "Nenhuma conta Instagram Business/Criador vinculada a esta Página do Facebook.",
      });
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
      return jsonResponse({ error: "Falha ao salvar conexão no banco de dados." });
    }

    console.log("Instagram connected:", igProfile.username);
    return jsonResponse({
      success: true,
      username: igProfile.username,
      ig_user_id: igUserId,
    });
  } catch (err) {
    console.error("Instagram auth error:", err);
    return jsonResponse({ error: `Erro interno: ${err.message || "desconhecido"}` });
  }
});
