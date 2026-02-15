import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("video") as File;
    if (!file) {
      return new Response(JSON.stringify({ error: "Nenhum vídeo enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to Supabase Storage (testimonials bucket)
    const fileName = `${user.id}/testimonial_${Date.now()}_${file.name}`;
    const fileBytes = await file.arrayBuffer();

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("testimonials")
      .upload(fileName, fileBytes, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload error: ${uploadError.message}`);
    }

    // Grant 6 months enterprise access
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    await supabaseAdmin
      .from("testimonial_submissions")
      .insert({ user_id: user.id, expires_at: expiresAt.toISOString() });

    const monthYear = new Date().toISOString().slice(0, 7);
    await supabaseAdmin
      .from("video_usage")
      .update({ plan: "enterprise" })
      .eq("user_id", user.id)
      .eq("month_year", monthYear);

    return new Response(
      JSON.stringify({ success: true, path: uploadData.path }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Upload testimonial error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
