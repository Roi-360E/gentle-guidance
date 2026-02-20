import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Safe fetch that handles non-JSON responses (e.g. 502 HTML pages)
async function fetchJsonSafely<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const preview = text.substring(0, 300);
    console.error(`fetchJsonSafely: expected JSON, got ${contentType} (status ${res.status})`);
    console.error("Response preview:", preview);

    if (text.trim().startsWith("<!") || text.includes("<html")) {
      throw new Error(`API retornou HTML (status ${res.status}) — possível erro de gateway ou redirect.`);
    }
    throw new Error(`Resposta inesperada do servidor (${res.status}): ${preview}`);
  }

  return res.json() as Promise<T>;
}


// Helper: find Instagram account through multiple fallback strategies
async function findInstagramAccount(longLivedToken: string) {
  let igUserId: string | null = null;
  let igUsername: string | null = null;
  let pageAccessToken: string | null = null;
  let pageId: string | null = null;
  const diagnostics: Record<string, unknown> = {};

  // Strategy 1: /me/accounts (traditional Facebook Pages)
  console.log("[S1] /me/accounts...");
  try {
    const pagesData = await fetchJsonSafely(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100&access_token=${longLivedToken}`
    );
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
          try {
            const d = await fetchJsonSafely(
              `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`
            );
            console.log(`[S1b] page ${page.name}:`, JSON.stringify(d));
            if (d.instagram_business_account?.id) {
              igUserId = d.instagram_business_account.id;
              igUsername = d.instagram_business_account.username || null;
              pageAccessToken = page.access_token;
              pageId = page.id;
              break;
            }
          } catch (e: any) {
            console.error(`[S1b] Error querying page ${page.id}:`, e.message);
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[S1] Error:", e.message);
    diagnostics.strategy1_pages = { error: { message: e.message } };
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 2: /me/businesses (Business Portfolio accounts)
  console.log("[S2] /me/businesses...");
  try {
    const bizData = await fetchJsonSafely(
      `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,instagram_business_accounts{id,username},owned_pages{id,name,access_token,instagram_business_account{id,username}}&access_token=${longLivedToken}`
    );
    diagnostics.strategy2_businesses = bizData;
    console.log("[S2]", JSON.stringify(bizData));

    if (bizData.data?.length > 0) {
      for (const biz of bizData.data) {
        if (biz.instagram_business_accounts?.data?.length > 0) {
          const igAcc = biz.instagram_business_accounts.data[0];
          igUserId = igAcc.id;
          igUsername = igAcc.username || null;
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
  } catch (e: any) {
    console.error("[S2] Error:", e.message);
    diagnostics.strategy2_businesses = { error: { message: e.message } };
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 3: /me?fields=instagram_accounts (Creator accounts)
  console.log("[S3] /me?fields=instagram_accounts...");
  try {
    const creatorData = await fetchJsonSafely(
      `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_accounts{id,username,name}&access_token=${longLivedToken}`
    );
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
  } catch (e: any) {
    console.error("[S3] Error:", e.message);
    diagnostics.strategy3_creator = { error: { message: e.message } };
  }
  if (igUserId) return { igUserId, igUsername, pageAccessToken, pageId, diagnostics };

  // Strategy 4: Try Graph API v20.0 fallback
  console.log("[S4] /me/accounts v20.0 fallback...");
  try {
    const pages20Data = await fetchJsonSafely(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${longLivedToken}`
    );
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
  } catch (e: any) {
    console.error("[S4] Error:", e.message);
    diagnostics.strategy4_v20 = { error: { message: e.message } };
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
    let tokenData: any;
    try {
      tokenData = await fetchJsonSafely(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
      );
    } catch (e: any) {
      console.error("Token exchange error:", e.message);
      return jsonResponse({ error: `Falha ao trocar o código OAuth: ${e.message}` });
    }
    if (tokenData.error) {
      console.error("Token error:", JSON.stringify(tokenData.error));
      return jsonResponse({ error: `Falha na troca do código: ${tokenData.error.message}` });
    }

    // Step 2: Exchange → long-lived token (60 days)
    let longTokenData: any = {};
    try {
      longTokenData = await fetchJsonSafely(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
      );
    } catch (e: any) {
      console.warn("Long token exchange failed, using short-lived:", e.message);
    }
    const longLivedToken = longTokenData.access_token || tokenData.access_token;
    console.log("Token:", longTokenData.access_token ? "long-lived ✅" : "short-lived ⚠️");

    // Step 3: Check permissions
    let grantedPerms: string[] = [];
    let declinedPerms: string[] = [];
    try {
      const permData = await fetchJsonSafely(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`
      );
      grantedPerms = permData?.data?.filter((p: any) => p.status === 'granted')?.map((p: any) => p.permission) || [];
      declinedPerms = permData?.data?.filter((p: any) => p.status === 'declined')?.map((p: any) => p.permission) || [];
      console.log("Granted:", grantedPerms, "| Declined:", declinedPerms);
    } catch (e: any) {
      console.warn("Permissions check failed:", e.message);
    }

    // Step 4: Find Instagram account via multiple strategies
    const { igUserId, igUsername: igFoundUsername, pageAccessToken, pageId, diagnostics } =
      await findInstagramAccount(longLivedToken);

    let igUsername = igFoundUsername;

    if (!igUserId || !pageAccessToken || !pageId) {
      let meInfo: any = {};
      try { meInfo = await fetchJsonSafely(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedToken}`); } catch (_) { /* ignore */ }
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
      try {
        const igProfile = await fetchJsonSafely(
          `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${pageAccessToken}`
        );
        igUsername = igProfile.username || igProfile.name || "unknown";
      } catch (e: any) {
        console.warn("Could not fetch IG username:", e.message);
        igUsername = "unknown";
      }
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
