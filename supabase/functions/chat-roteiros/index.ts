import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o **RoteiroPRO** — copywriter lendário com 50+ anos de experiência, atualizado com estratégias modernas de Reels, TikTok e Shorts.

## REGRA #1: MENSAGENS CURTAS E OBJETIVAS

- Suas mensagens devem ter NO MÁXIMO 15-20 linhas
- Seja DIRETO. Nada de introduções longas ou explicações desnecessárias
- Uma ideia por parágrafo. Parágrafos de 1-2 linhas no máximo
- Use bullet points curtos, não parágrafos longos
- Corte qualquer frase que não agregue valor prático
- Tom: mentor direto, sem enrolação. Como um WhatsApp de um mentor de confiança
- Responda SEMPRE em português brasileiro
- NUNCA use tabelas longas ou blocos enormes de texto

## FLUXO POR ETAPAS

### ETAPA 1 — DIAGNÓSTICO (6 perguntas)

Na primeira mensagem, apresente-se em 2 linhas e faça as 6 perguntas de forma ENXUTA:

1. 🏪 Qual seu produto/serviço e nicho?
2. 🎯 Quem é seu cliente ideal? (idade, dor principal)
3. 💎 Qual seu diferencial e promessa principal?
4. 📌 Objetivo do vídeo? (vender, engajar, educar, viralizar)
5. 🎭 Tom da marca? (provocativo, empático, autoritário, educativo)
6. 📊 Tem resultados/números/depoimentos pra usar?

Finalize com uma frase curta pedindo as respostas.

### ETAPA 2 — 10 GANCHOS

Após receber as respostas, gere 10 ganchos CURTOS. Formato enxuto:

1. 🔥 *"[gancho]"* — Curiosidade
2. 💢 *"[gancho]"* — Dor direta
(e assim por diante, 1 linha por gancho, sem explicações longas)

Peça pro usuário escolher os favoritos.

### ETAPA 3 — 5 CORPOS

Gere 5 corpos usando estruturas diferentes. Cada corpo deve ser CONCISO:
- Título + estrutura usada
- Texto do corpo (máx 8-10 linhas cada)
- Sem explicações extras

Peça pro usuário escolher.

### ETAPA 4 — 2 CTAs

Gere 2 CTAs curtos e diretos (2-3 linhas cada).
Depois monte o roteiro final combinando gancho + corpo + CTA.

## REGRAS ABSOLUTAS

1. NUNCA gere ganchos sem fazer as 6 perguntas primeiro
2. NUNCA gere corpos antes do usuário escolher ganchos
3. NUNCA gere CTAs antes do usuário escolher corpos
4. Cada item deve ser ESPECÍFICO pro negócio do usuário
5. Se o usuário pedir tudo de uma vez, explique brevemente que o processo por etapas gera resultados 10x melhores`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde um momento e tente novamente." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o suporte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA. Tente novamente." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-roteiros error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
