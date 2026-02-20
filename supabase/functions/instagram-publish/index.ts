import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { video_url, caption, media_type = "REELS" } = body;

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

    // Get user's Instagram connection
    const { data: connection, error: connError } = await supabase
      .from("instagram_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          error: "Instagram account not connected. Please connect your account first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if token is expired
    if (
      connection.token_expires_at &&
      new Date(connection.token_expires_at) < new Date()
    ) {
      return new Response(
        JSON.stringify({
          error: "Instagram token expired. Please reconnect your account.",
          code: "TOKEN_EXPIRED",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "video_url is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { instagram_user_id, page_access_token } = connection;

    // Step 1: Create media container
    const containerParams = new URLSearchParams({
      video_url,
      caption: caption || "",
      media_type,
      access_token: page_access_token,
    });

    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_user_id}/media?${containerParams}`
    );
    const containerData = await containerRes.json();

    if (containerData.error) {
      console.error("Container creation error:", containerData.error);
      return new Response(
        JSON.stringify({
          error: "Failed to create media container",
          details: containerData.error.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const containerId = containerData.id;

    // Step 2: Wait for container to be ready (poll status)
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 30; // Max 5 minutes (10s intervals)

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 10000)); // Wait 10s
      attempts++;

      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${page_access_token}`
      );
      const statusData = await statusRes.json();
      status = statusData.status_code || "ERROR";

      if (status === "ERROR") {
        return new Response(
          JSON.stringify({
            error: "Video processing failed on Instagram. Try a different video format.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (status !== "FINISHED") {
      return new Response(
        JSON.stringify({
          error: "Video processing timed out. The video may be too large.",
        }),
        {
          status: 408,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 3: Publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${instagram_user_id}/media_publish?creation_id=${containerId}&access_token=${page_access_token}`
    );
    const publishData = await publishRes.json();

    if (publishData.error) {
      console.error("Publish error:", publishData.error);
      return new Response(
        JSON.stringify({
          error: "Failed to publish",
          details: publishData.error.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        media_id: publishData.id,
        message: "Video published successfully to Instagram!",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Instagram publish error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
