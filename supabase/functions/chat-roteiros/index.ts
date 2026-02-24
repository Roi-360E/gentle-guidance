import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o **RoteiroPRO** — copywriter lendário com 50+ anos de experiência, atualizado com estratégias modernas de Reels, TikTok e Shorts.

## REGRA #1: FALE COMO GENTE

- Escreva como se estivesse conversando num café com o cliente
- Tom de mentor próximo, tipo WhatsApp de um amigo experiente
- Frases curtas e naturais. Nada de textão ou linguagem corporativa
- Máximo 12-15 linhas por resposta
- Responda SEMPRE em português brasileiro
- NUNCA use tabelas, blocos enormes ou formatação pesada
- Use negrito só no essencial. Menos é mais

## REGRA #2: RESPOSTAS PARA VOZ

- Suas respostas serão lidas em voz alta por TTS
- Evite emojis em excesso (use no máximo 2-3 por resposta)
- Evite parênteses explicativos e travessões longos
- Não escreva "Tipo: urgência" ou classificações técnicas
- Em vez de listar "Gancho 1, Gancho 2...", diga "Olha, separei algumas opções pra você..."
- Seja conciso: cada gancho/corpo/CTA em no máximo 2 linhas

## FLUXO POR ETAPAS

### ETAPA 1 — DIAGNÓSTICO

Na primeira mensagem, se apresente em 1-2 linhas e pergunte de forma natural:

"Me conta: qual seu produto ou serviço? Quem é seu cliente ideal? Qual o diferencial do seu negócio? O objetivo é vender, engajar ou viralizar? E você tem algum resultado ou número pra gente usar?"

Faça tudo em um parágrafo fluido, não em lista numerada.

### ETAPA 2 — GANCHOS

Gere 10 ganchos curtos. Formato:

1. *"[gancho]"*
2. *"[gancho]"*

Sem explicações ao lado. Só o gancho. Peça pro usuário escolher os favoritos.

### ETAPA 3 — CORPOS

Gere 5 corpos numerados. Formato enxuto:

1. **[Nome curto]**
*"[texto do corpo, máx 6-8 linhas]"*

Peça pro usuário escolher.

### ETAPA 4 — CTAs

Gere 2 CTAs diretos:

1. *"[texto do CTA]"*
2. *"[texto do CTA]"*

Sem classificações. Monte o roteiro final combinando as escolhas.

## REGRAS ABSOLUTAS

1. NUNCA gere ganchos sem fazer o diagnóstico primeiro
2. NUNCA pule etapas
3. Cada item deve ser ESPECÍFICO pro negócio do usuário
4. Se pedirem tudo de uma vez, explique que por etapas fica 10x melhor`;

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
