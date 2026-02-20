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

// Helper: fetch all pages with multiple strategies
async function findInstagramAccount(longLivedToken: string) {
  let igUserId: string | null = null;
  let igUsername: string | null = null;
  let pageAccessToken: string | null = null;
  let pageId: string | null = null;
  const diagnostics: Record<string, unknown> = {};

  // Strategy 1: /me/accounts (traditional pages)
  console.log("[Strategy 1] Trying /me/accounts...");
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${longLivedToken}`
  );
  const pagesData = await pagesRes.json();
  diagnostics.strategy1_pages = pagesData;
  console.log("[Strategy 1] Result:", JSON.stringify(pagesData));

  if (pagesData.data && pagesData.data.length > 0) {
    for (const page of pagesData.data) {
      if (page.instagram_business_account?.id) {
        igUserId = page.instagram_business_account.id;
        igUsername = page.instagram_business_account.username || null;
        pageAccessToken = page.access_token;
        pageId = page.id;
        console.log(`[Strategy 1] Found IG account ${igUserId} via page ${page.name}`);
        break;
      }
    }
  }

  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 2: Try /me/businesses — for Business Portfolio accounts
  console.log("[Strategy 2] Trying /me/businesses...");
  const bizRes = await fetch(
    `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,instagram_business_accounts{id,username},owned_pages{id,name,access_token,instagram_business_account{id,username}}&access_token=${longLivedToken}`
  );
  const bizData = await bizRes.json();
  diagnostics.strategy2_businesses = bizData;
  console.log("[Strategy 2] Result:", JSON.stringify(bizData));

  if (bizData.data && bizData.data.length > 0) {
    for (const biz of bizData.data) {
      // Try instagram_business_accounts directly from business
      if (biz.instagram_business_accounts?.data?.length > 0) {
        const igAccount = biz.instagram_business_accounts.data[0];
        igUserId = igAccount.id;
        igUsername = igAccount.username || null;
        // For business portfolio, we need to find a page token
        // Try owned pages
        if (biz.owned_pages?.data?.length > 0) {
          for (const page of biz.owned_pages.data) {
            if (page.instagram_business_account?.id === igUserId) {
              pageAccessToken = page.access_token;
              pageId = page.id;
              break;
            }
          }
          // If no matching page, use first page's token as fallback
          if (!pageAccessToken && biz.owned_pages.data[0]?.access_token) {
            pageAccessToken = biz.owned_pages.data[0].access_token;
            pageId = biz.owned_pages.data[0].id;
          }
        }
        // If still no page token, use user token as fallback for reading username
        if (!pageAccessToken) {
          pageAccessToken = longLivedToken;
          pageId = igUserId; // fallback
        }
        console.log(`[Strategy 2] Found IG account ${igUserId} via business ${biz.name}`);
        break;
      }

      // Try owned_pages from business
      if (biz.owned_pages?.data?.length > 0) {
        for (const page of biz.owned_pages.data) {
          if (page.instagram_business_account?.id) {
            igUserId = page.instagram_business_account.id;
            igUsername = page.instagram_business_account.username || null;
            pageAccessToken = page.access_token;
            pageId = page.id;
            console.log(`[Strategy 2] Found IG account ${igUserId} via business owned page ${page.name}`);
            break;
          }
        }
        if (igUserId) break;
      }
    }
  }

  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 3: Try the user's own profile instagram connection (Creator accounts)
  console.log("[Strategy 3] Trying /me?fields=instagram_accounts...");
  const creatorRes = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_accounts{id,username}&access_token=${longLivedToken}`
  );
  const creatorData = await creatorRes.json();
  diagnostics.strategy3_creator = creatorData;
  console.log("[Strategy 3] Result:", JSON.stringify(creatorData));

  if (creatorData.instagram_accounts?.data?.length > 0) {
    const igAcc = creatorData.instagram_accounts.data[0];
    igUserId = igAcc.id;
    igUsername = igAcc.username || null;
    // For creator accounts, use the user token as page token
    pageAccessToken = longLivedToken;
    pageId = igAcc.id;
    console.log(`[Strategy 3] Found creator IG account ${igUserId}`);
  }

  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 4: Get all pages via pages_show_list scope then query each
  console.log("[Strategy 4] Trying /me/accounts with page_token grants...");
  if (pagesData.data && pagesData.data.length > 0) {
    for (const page of pagesData.data) {
      const igCheckRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`
      );
      const igCheckData = await igCheckRes.json();
      console.log(`[Strategy 4] Page ${page.id} check:`, JSON.stringify(igCheckData));
      if (igCheckData.instagram_business_account?.id) {
        igUserId = igCheckData.instagram_business_account.id;
        igUsername = igCheckData.instagram_business_account.username || null;
        pageAccessToken = page.access_token;
        pageId = page.id;
        break;
      }
    }
  }

  return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };
}

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
    if (longTokenData.error) {
      console.error("Long token exchange error:", JSON.stringify(longTokenData.error));
    }
    const longLivedToken = longTokenData.access_token || tokenData.access_token;
    console.log("Using token type:", longTokenData.access_token ? "long-lived" : "short-lived");

    // Step 3: Check granted permissions
    const permRes = await fetch(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`
    );
    const permData = await permRes.json();
    const grantedPerms = permData?.data?.filter((p: any) => p.status === 'granted')?.map((p: any) => p.permission) || [];
    const declinedPerms = permData?.data?.filter((p: any) => p.status === 'declined')?.map((p: any) => p.permission) || [];
    console.log("Granted permissions:", JSON.stringify(grantedPerms));
    console.log("Declined permissions:", JSON.stringify(declinedPerms));

    // Step 4: Try all strategies to find Instagram account
    const { igUserId, igUsername: igUsernameFromSearch, pageAccessToken, pageId, diagnostics } = 
      await findInstagramAccount(longLivedToken);

    let igUsername = igUsernameFromSearch;

    if (!igUserId || !pageAccessToken || !pageId) {
      const meInfoRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedToken}`);
      const meInfo = await meInfoRes.json();
      console.error("All strategies failed. FB User:", meInfo?.name, "| Granted:", grantedPerms);

      let errorMsg = "";
      if (declinedPerms.includes('pages_show_list')) {
        errorMsg = "Você recusou a permissão de acesso às Páginas. Reconecte e conceda todos os acessos solicitados.";
      } else if (!grantedPerms.includes('pages_show_list')) {
        errorMsg = "A permissão 'pages_show_list' não foi concedida. Tente reconectar e conceda todos os acessos.";
      } else {
        errorMsg = "Conta Instagram Business não encontrada. Verifique se: (1) sua conta Instagram está em modo Profissional (Business ou Criador), e (2) está vinculada a uma Página do Facebook.";
      }

      return jsonResponse({ 
        error: errorMsg,
        _debug: {
          fb_user: meInfo,
          granted_permissions: grantedPerms,
          declined_permissions: declinedPerms,
          long_token_ok: !!longTokenData.access_token,
          ...diagnostics,
        }
      });
    }

    // Step 5: Get Instagram username if not already found
    if (!igUsername) {
      const igProfileRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${pageAccessToken}`
      );
      const igProfile = await igProfileRes.json();
      igUsername = igProfile.username || igProfile.name || "unknown";
    }
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
