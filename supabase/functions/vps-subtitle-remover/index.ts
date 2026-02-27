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
    const vpsUrl = Deno.env.get('VPS_SUBTITLE_URL');
    if (!vpsUrl) {
      return new Response(JSON.stringify({ error: 'VPS_SUBTITLE_URL not configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward the multipart form data directly to the VPS
    const formData = await req.formData();
    
    // Add speed optimization hints for VPS
    formData.append('preset', 'ultrafast');
    formData.append('crf', '23');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const vpsResponse = await fetch(vpsUrl, {
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

    // Return the processed video
    const videoBlob = await vpsResponse.arrayBuffer();
    return new Response(videoBlob, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="clean.mp4"',
      },
    });
  } catch (error) {
    const msg = error.name === 'AbortError' ? 'VPS timeout (>12s)' : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});