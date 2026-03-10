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
    const subtitleUrl = Deno.env.get('VPS_SUBTITLE_URL');
    if (!subtitleUrl) {
      return new Response(JSON.stringify({ error: 'VPS not configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build concat URL from subtitle URL base
    const baseUrl = subtitleUrl.replace(/\/[^\/]*$/, '');
    const concatUrl = `${baseUrl}/concat`;

    // Forward the multipart form data (hook, body, cta + settings)
    const formData = await req.formData();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s for concat

    const vpsResponse = await fetch(concatUrl, {
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
        'Content-Disposition': 'attachment; filename="concatenated.mp4"',
      },
    });
  } catch (error) {
    const msg = error.name === 'AbortError' ? 'VPS timeout (>60s)' : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
