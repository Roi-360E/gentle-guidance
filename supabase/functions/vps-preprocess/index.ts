import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Derive VPS preprocess URL from the subtitle URL (same server, different endpoint)
    const subtitleUrl = Deno.env.get('VPS_SUBTITLE_URL');
    if (!subtitleUrl) {
      return new Response(JSON.stringify({ error: 'VPS not configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build preprocess URL from subtitle URL base
    const baseUrl = subtitleUrl.replace(/\/[^\/]*$/, '');
    const preprocessUrl = `${baseUrl}/preprocess`;

    // Forward the multipart form data directly to VPS
    const formData = await req.formData();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const vpsResponse = await fetch(preprocessUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text().catch(() => 'Unknown error');
      return new Response(JSON.stringify({ error: `VPS error: ${vpsResponse.status} - ${errorText}` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const videoBlob = await vpsResponse.arrayBuffer();
    return new Response(videoBlob, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="preprocessed.mp4"',
      },
    });
  } catch (error) {
    const msg = error.name === 'AbortError' ? 'VPS timeout (>15s)' : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
