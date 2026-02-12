import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, style, tone, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";

    if (action === "generate") {
      systemPrompt = `Você é um especialista em criação de legendas para vídeos de marketing e redes sociais.
Gere legendas criativas, envolventes e prontas para uso com base no texto fornecido pelo usuário.

Estilo solicitado: ${style || "formal"}
Tom solicitado: ${tone || "neutral"}

Regras:
- Retorne APENAS as legendas geradas, sem explicações extras
- Use emojis quando o estilo for "casual" ou "criativo"
- Mantenha parágrafos curtos (máx 2 linhas)
- Inclua hashtags relevantes ao final quando apropriado
- Se o tom for "persuasivo", use gatilhos mentais
- Se o tom for "humoristico", inclua humor leve e descontraído`;
    } else if (action === "edit") {
      systemPrompt = `Você é um editor de legendas profissional. Edite a legenda fornecida aplicando o estilo e tom solicitados.

Estilo solicitado: ${style || "formal"}
Tom solicitado: ${tone || "neutral"}

Regras:
- Retorne APENAS a legenda editada
- Mantenha a mensagem principal intacta
- Adapte vocabulário e formatação ao estilo pedido
- Melhore a clareza e o impacto sem alterar o significado`;
    } else {
      systemPrompt = `Você é um assistente de legendas. Ajude o usuário com o que ele pedir sobre legendas de vídeo. Responda em português brasileiro.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-subtitles error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
