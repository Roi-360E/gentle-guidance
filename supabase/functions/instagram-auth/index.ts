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
      return jsonResponse({ error: "Não autenticado. Faça login novamente." });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: `Autenticação falhou: ${userError?.message || "Usuário não encontrado"}` });
    }
    const userId = userData.user.id;

    // Action: disconnect
    if (action === "disconnect") {
      await supabase.from("instagram_connections").delete().eq("user_id", userId);
      return jsonResponse({ success: true });
    }

    // Action: status
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
      console.error("Token exchange error:", JSON.stringify(tokenData.error));
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

    // Step 3: Check granted permissions
    const permRes = await fetch(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`
    );
    const permData = await permRes.json();
    const grantedPerms = permData?.data?.filter((p: any) => p.status === 'granted')?.map((p: any) => p.permission) || [];
    const declinedPerms = permData?.data?.filter((p: any) => p.status === 'declined')?.map((p: any) => p.permission) || [];
    console.log("Granted permissions:", JSON.stringify(grantedPerms));
    console.log("Declined permissions:", JSON.stringify(declinedPerms));

    // Step 4: Get user's Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();
    console.log("Pages response:", JSON.stringify(pagesData));

    let igUserId: string | null = null;
    let igUsername: string | null = null;
    let pageAccessToken: string | null = null;
    let pageId: string | null = null;

    if (pagesData.data && pagesData.data.length > 0) {
      // Try to find a page with Instagram connected
      for (const page of pagesData.data) {
        if (page.instagram_business_account?.id) {
          igUserId = page.instagram_business_account.id;
          pageAccessToken = page.access_token;
          pageId = page.id;
          console.log(`Found Instagram via page ${page.name}: IG ID ${igUserId}`);
          break;
        }
      }

      // If no page has instagram_business_account directly, fetch each page
      if (!igUserId) {
        for (const page of pagesData.data) {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
          );
          const igData = await igRes.json();
          console.log(`Page ${page.name} (${page.id}) IG data:`, JSON.stringify(igData));
          if (igData.instagram_business_account?.id) {
            igUserId = igData.instagram_business_account.id;
            pageAccessToken = page.access_token;
            pageId = page.id;
            break;
          }
        }
      }
    } else {
      // No pages found — try fallback using user's own Instagram account
      // This works for Creator accounts connected directly without a traditional Page
      console.log("No pages found, trying direct Instagram account lookup...");
      
      // Try to get instagram_account directly from user profile
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token,instagram_business_account}&access_token=${longLivedToken}`
      );
      const meData = await meRes.json();
      console.log("Me+accounts response:", JSON.stringify(meData));

      if (meData.accounts?.data?.length > 0) {
        for (const page of meData.accounts.data) {
          if (page.instagram_business_account?.id) {
            igUserId = page.instagram_business_account.id;
            pageAccessToken = page.access_token;
            pageId = page.id;
            break;
          }
        }
      }
    }

    if (!igUserId || !pageAccessToken || !pageId) {
      // Build diagnostic error message
      let errorMsg = "";

      if (declinedPerms.includes('pages_show_list')) {
        errorMsg = "Você recusou a permissão de acesso às Páginas. Reconecte e, na tela de permissões do Facebook, clique em 'Editar' e selecione sua Página antes de continuar.";
      } else if (!grantedPerms.includes('pages_show_list')) {
        errorMsg = "A permissão 'pages_show_list' não foi concedida. Tente reconectar.";
      } else if (pagesData.data && pagesData.data.length > 0) {
        errorMsg = `Nenhuma conta Instagram Business encontrada nas suas ${pagesData.data.length} Página(s) do Facebook. Certifique-se de que sua conta Instagram está configurada como 'Profissional' (Business ou Criador) e vinculada à Página do Facebook.`;
      } else {
        errorMsg = "Nenhuma Página do Facebook foi selecionada durante a autorização. Ao conectar, você deve clicar em 'Editar' na tela de seleção de Páginas do Facebook e selecionar sua Página antes de clicar em 'Continuar'.";
      }

      console.error("Connection failed. Granted:", grantedPerms, "Declined:", declinedPerms, "Pages:", pagesData?.data?.length);
      return jsonResponse({ error: errorMsg });
    }

    // Step 5: Get Instagram username
    const igProfileRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${pageAccessToken}`
    );
    const igProfile = await igProfileRes.json();
    igUsername = igProfile.username || igProfile.name || "unknown";
    console.log("Instagram username:", igUsername);

    // Step 6: Calculate token expiry (60 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Step 7: Upsert connection
    const { error: upsertError } = await supabase
      .from("instagram_connections")
      .upsert(
        {
          user_id: userId,
          instagram_user_id: igUserId,
          instagram_username: igUsername,
          page_id: pageId,
          page_access_token: pageAccessToken,
          token_expires_at: expiresAt.toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return jsonResponse({ error: "Falha ao salvar conexão no banco de dados." });
    }

    console.log("Instagram connected successfully:", igUsername);
    return jsonResponse({
      success: true,
      username: igUsername,
      ig_user_id: igUserId,
    });
  } catch (err) {
    console.error("Instagram auth error:", err);
    return jsonResponse({ error: `Erro interno: ${err.message || "desconhecido"}` });
  }
});
