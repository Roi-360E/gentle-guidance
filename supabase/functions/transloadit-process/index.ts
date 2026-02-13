import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Generate Transloadit signature using Web Crypto API
async function signParams(params: string, authSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret),
    { name: "HMAC", hash: "SHA-384" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(params));
  const hex = new TextDecoder().decode(hexEncode(new Uint8Array(signature)));
  return `sha384:${hex}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const TRANSLOADIT_AUTH_KEY = Deno.env.get("TRANSLOADIT_AUTH_KEY");
    const TRANSLOADIT_AUTH_SECRET = Deno.env.get("TRANSLOADIT_AUTH_SECRET");
    if (!TRANSLOADIT_AUTH_KEY) {
      return jsonResponse({ error: "TRANSLOADIT_AUTH_KEY not configured" }, 500);
    }
    if (!TRANSLOADIT_AUTH_SECRET) {
      return jsonResponse({ error: "TRANSLOADIT_AUTH_SECRET not configured" }, 500);
    }

    const body = await req.json();
    const { action, videoUrls, resolution, assemblyId, fileNames } = body as {
      action: string;
      videoUrls?: { hook: string; body: string; cta: string }[];
      resolution?: string;
      assemblyId?: string;
      fileNames?: string[];
    };

    // ── ACTION: create-assembly ──────────────────────────────────
    if (action === "create-assembly") {

      if (!videoUrls?.length) {
        return jsonResponse({ error: "No video URLs provided" }, 400);
      }

      // Build Transloadit template steps for each combination
      const assemblies: { assemblyId: string; combinationIndex: number }[] = [];

      for (let i = 0; i < videoUrls.length; i++) {
        const combo = videoUrls[i];
        const resMap: Record<string, string> = {
          "1080p": "1920x1080",
          "720p": "1280x720",
          "480p": "854x480",
          "360p": "640x360",
        };
        const res = resMap[resolution] || "1280x720";
        const [width, height] = res.split("x");

        const steps: Record<string, unknown> = {
          "hook-import": {
            robot: "/http/import",
            url: combo.hook,
          },
          "body-import": {
            robot: "/http/import",
            url: combo.body,
          },
          "cta-import": {
            robot: "/http/import",
            url: combo.cta,
          },
          "concat-video": {
            use: {
              steps: [
                { name: "hook-import" },
                { name: "body-import" },
                { name: "cta-import" },
              ],
              bundle_steps: true,
            },
            robot: "/video/concat",
            ffmpeg_stack: "v6",
            preset: "android",
            width: parseInt(width),
            height: parseInt(height),
            resize_strategy: "pad",
          },
        };

        // Expiry: 2 hours from now
        const expires = new Date(Date.now() + 2 * 60 * 60 * 1000)
          .toISOString()
          .replace("T", " ")
          .substring(0, 19) + "+00:00";

        const params = JSON.stringify({
          auth: {
            key: TRANSLOADIT_AUTH_KEY,
            expires,
          },
          steps,
        });

        const signature = await signParams(params, TRANSLOADIT_AUTH_SECRET);

        // Create assembly via Transloadit API
        const formData = new FormData();
        formData.append("params", params);
        formData.append("signature", signature);

        const assemblyRes = await fetch(
          "https://api2.transloadit.com/assemblies",
          { method: "POST", body: formData }
        );

        if (!assemblyRes.ok) {
          const errText = await assemblyRes.text();
          console.error(`Transloadit assembly creation failed [${assemblyRes.status}]:`, errText);
          return jsonResponse(
            { error: `Transloadit error: ${assemblyRes.status}`, details: errText },
            500
          );
        }

        const assemblyData = await assemblyRes.json();
        assemblies.push({
          assemblyId: assemblyData.assembly_id,
          combinationIndex: i,
        });
      }

      return jsonResponse({ assemblies });
    }

    // ── ACTION: check-status ────────────────────────────────────
    if (action === "check-status") {

      if (!assemblyId) {
        return jsonResponse({ error: "No assemblyId provided" }, 400);
      }

      const statusRes = await fetch(
        `https://api2.transloadit.com/assemblies/${assemblyId}`
      );

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        return jsonResponse({ error: `Status check failed: ${statusRes.status}`, details: errText }, 500);
      }

      const statusData = await statusRes.json();

      let resultUrl: string | null = null;
      if (statusData.ok === "ASSEMBLY_COMPLETED" && statusData.results) {
        // Get the result URL from the concat step
        const concatResults = statusData.results["concat-video"];
        if (concatResults?.length > 0) {
          resultUrl = concatResults[0].ssl_url || concatResults[0].url;
        }
      }

      return jsonResponse({
        status: statusData.ok,
        error: statusData.error || null,
        message: statusData.message || null,
        resultUrl,
        progress: statusData.bytes_expected
          ? Math.round((statusData.bytes_received / statusData.bytes_expected) * 100)
          : null,
      });
    }

    // ── ACTION: get-upload-urls ──────────────────────────────────
    if (action === "get-upload-urls") {

      if (!fileNames?.length) {
        return jsonResponse({ error: "No file names provided" }, 400);
      }

      const uploadUrls: { fileName: string; path: string; signedUrl: string }[] = [];

      for (const fileName of fileNames) {
        const path = `${userId}/${Date.now()}_${fileName}`;
        const { data, error } = await supabase.storage
          .from("videos")
          .createSignedUploadUrl(path);

        if (error) {
          console.error("Signed URL error:", error);
          return jsonResponse({ error: `Failed to create upload URL for ${fileName}` }, 500);
        }

        // Also get a signed download URL (1 hour)
        const { data: downloadData } = await supabase.storage
          .from("videos")
          .createSignedUrl(path, 3600);

        uploadUrls.push({
          fileName,
          path,
          signedUrl: data.signedUrl,
        });
      }

      return jsonResponse({ uploadUrls });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("transloadit-process error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500
    );
  }
});
