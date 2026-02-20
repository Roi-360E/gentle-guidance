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

// Helper: find Instagram account through multiple fallback strategies
async function findInstagramAccount(longLivedToken: string) {
  let igUserId: string | null = null;
  let igUsername: string | null = null;
  let pageAccessToken: string | null = null;
  let pageId: string | null = null;
  const diagnostics: Record<string, unknown> = {};

  // Strategy 1: /me/accounts (traditional Facebook Pages)
  console.log("[S1] /me/accounts...");
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100&access_token=${longLivedToken}`
  );
  const pagesData = await pagesRes.json();
  diagnostics.strategy1_pages = pagesData;
  console.log("[S1]", JSON.stringify(pagesData));

  if (pagesData.data?.length > 0) {
    for (const page of pagesData.data) {
      if (page.instagram_business_account?.id) {
        igUserId = page.instagram_business_account.id;
        igUsername = page.instagram_business_account.username || page.instagram_business_account.name || null;
        pageAccessToken = page.access_token;
        pageId = page.id;
        console.log(`[S1] Found IG ${igUserId} on page ${page.name}`);
        break;
      }
    }
    // Pages found but no IG link — query each page individually
    if (!igUserId) {
      for (const page of pagesData.data) {
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`
        );
        const d = await r.json();
        console.log(`[S1b] page ${page.name}:`, JSON.stringify(d));
        if (d.instagram_business_account?.id) {
          igUserId = d.instagram_business_account.id;
          igUsername = d.instagram_business_account.username || null;
          pageAccessToken = page.access_token;
          pageId = page.id;
          break;
        }
      }
    }
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 2: /me/businesses (Business Portfolio accounts)
  console.log("[S2] /me/businesses...");
  const bizRes = await fetch(
    `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,instagram_business_accounts{id,username},owned_pages{id,name,access_token,instagram_business_account{id,username}}&access_token=${longLivedToken}`
  );
  const bizData = await bizRes.json();
  diagnostics.strategy2_businesses = bizData;
  console.log("[S2]", JSON.stringify(bizData));

  if (bizData.data?.length > 0) {
    for (const biz of bizData.data) {
      if (biz.instagram_business_accounts?.data?.length > 0) {
        const igAcc = biz.instagram_business_accounts.data[0];
        igUserId = igAcc.id;
        igUsername = igAcc.username || null;
        // Find a page token for this IG account
        if (biz.owned_pages?.data?.length > 0) {
          for (const page of biz.owned_pages.data) {
            if (page.instagram_business_account?.id === igUserId || !pageAccessToken) {
              pageAccessToken = page.access_token;
              pageId = page.id;
              if (page.instagram_business_account?.id === igUserId) break;
            }
          }
        }
        if (!pageAccessToken) { pageAccessToken = longLivedToken; pageId = igUserId; }
        console.log(`[S2] Found IG ${igUserId} via business ${biz.name}`);
        break;
      }
      if (biz.owned_pages?.data?.length > 0) {
        for (const page of biz.owned_pages.data) {
          if (page.instagram_business_account?.id) {
            igUserId = page.instagram_business_account.id;
            igUsername = page.instagram_business_account.username || null;
            pageAccessToken = page.access_token;
            pageId = page.id;
            console.log(`[S2b] Found IG ${igUserId} via biz owned_page`);
            break;
          }
        }
        if (igUserId) break;
      }
    }
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 3: /me?fields=instagram_accounts (Creator accounts)
  console.log("[S3] /me?fields=instagram_accounts...");
  const creatorRes = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_accounts{id,username,name}&access_token=${longLivedToken}`
  );
  const creatorData = await creatorRes.json();
  diagnostics.strategy3_creator = creatorData;
  console.log("[S3]", JSON.stringify(creatorData));

  if (creatorData.instagram_accounts?.data?.length > 0) {
    const igAcc = creatorData.instagram_accounts.data[0];
    igUserId = igAcc.id;
    igUsername = igAcc.username || igAcc.name || null;
    pageAccessToken = longLivedToken;
    pageId = igAcc.id;
    console.log(`[S3] Found creator IG ${igUserId}`);
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 4: Try Graph API v20.0 fallback
  console.log("[S4] /me/accounts v20.0 fallback...");
  const pages20Res = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${longLivedToken}`
  );
  const pages20Data = await pages20Res.json();
  diagnostics.strategy4_v20 = pages20Data;
  console.log("[S4]", JSON.stringify(pages20Data));

  if (pages20Data.data?.length > 0) {
    for (const page of pages20Data.data) {
      if (page.instagram_business_account?.id) {
        igUserId = page.instagram_business_account.id;
        pageAccessToken = page.access_token;
        pageId = page.id;
        console.log(`[S4] Found IG ${igUserId} via v20 page ${page.name}`);
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

    if (action === "get_app_id") {
      return jsonResponse({ app_id: META_APP_ID });
    }

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

    if (action === "disconnect") {
      await supabase.from("instagram_connections").delete().eq("user_id", userId);
      return jsonResponse({ success: true });
    }

    if (action === "status") {
      const { data } = await supabase
        .from("instagram_connections")
        .select("instagram_username, instagram_user_id")
        .eq("user_id", userId)
        .maybeSingle();
      return jsonResponse({ connected: !!data, connection: data });
    }

    if (!code) {
      return jsonResponse({ error: "Código de autorização é obrigatório" });
    }

    const redirectUri = body.redirect_uri;
    console.log("redirect_uri:", redirectUri);

    // Step 1: Exchange code → short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("Token error:", JSON.stringify(tokenData.error));
      return jsonResponse({ error: `Falha na troca do código: ${tokenData.error.message}` });
    }

    // Step 2: Exchange → long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const longLivedToken = longTokenData.access_token || tokenData.access_token;
    console.log("Token:", longTokenData.access_token ? "long-lived ✅" : "short-lived ⚠️");

    // Step 3: Check permissions
    const permRes = await fetch(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`
    );
    const permData = await permRes.json();
    const grantedPerms = permData?.data?.filter((p: any) => p.status === 'granted')?.map((p: any) => p.permission) || [];
    const declinedPerms = permData?.data?.filter((p: any) => p.status === 'declined')?.map((p: any) => p.permission) || [];
    console.log("Granted:", grantedPerms, "| Declined:", declinedPerms);

    // Step 4: Find Instagram account via multiple strategies
    const { igUserId, igUsername: igFoundUsername, pageAccessToken, pageId, diagnostics } =
      await findInstagramAccount(longLivedToken);

    let igUsername = igFoundUsername;

    if (!igUserId || !pageAccessToken || !pageId) {
      const meInfoRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedToken}`);
      const meInfo = await meInfoRes.json();
      console.error("All strategies failed. User:", meInfo?.name, "| Granted:", grantedPerms);

      return jsonResponse({
        error: "Conta Instagram Business não encontrada. Veja o diagnóstico abaixo.",
        _debug: {
          fb_user: meInfo,
          granted_permissions: grantedPerms,
          declined_permissions: declinedPerms,
          long_token_ok: !!longTokenData.access_token,
          ...diagnostics,
        }
      });
    }

    // Step 5: Get username if not already found
    if (!igUsername) {
      const igProfileRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${pageAccessToken}`
      );
      const igProfile = await igProfileRes.json();
      igUsername = igProfile.username || igProfile.name || "unknown";
    }
    console.log("IG username:", igUsername);

    // Step 6: Token expiry (60 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Step 7: Save connection
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

    console.log("Connected:", igUsername);
    return jsonResponse({ success: true, username: igUsername, ig_user_id: igUserId });

  } catch (err) {
    console.error("Instagram auth error:", err);
    return jsonResponse({ error: `Erro interno: ${err.message || "desconhecido"}` });
  }
});
