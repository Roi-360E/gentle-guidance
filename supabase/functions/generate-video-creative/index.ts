import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UGC_ASPECTS = [
  "Pessoa real falando diretamente para a câmera (talking head)",
  "Iluminação natural e cenário casual/autêntico (quarto, cozinha, escritório)",
  "Enquadramento close-up ou meio-corpo para conexão pessoal",
  "Movimentos de câmera orgânicos (leve tremor, zoom suave)",
  "Texto overlay com fontes modernas e cores vibrantes",
  "Transições rápidas e dinâmicas (jump cuts, zoom transitions)",
  "Legendas automáticas em estilo TikTok/Reels",
  "Hook forte nos primeiros 3 segundos",
  "CTA claro e direto no final",
  "Música de fundo trending ou som original",
  "Demonstração do produto em uso real",
  "Depoimento autêntico com emoção genuína",
  "Storytelling pessoal (antes/depois, problema/solução)",
  "Efeitos nativos da plataforma (filtros, stickers, polls)",
  "Duração ideal entre 15-60 segundos",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, model, aspect, imageDescriptions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isUGC = model?.toLowerCase().includes("ugc");

    let systemPrompt = `Você é um diretor criativo especialista em produção de vídeos para redes sociais. 
Sua tarefa é gerar um roteiro detalhado e direção criativa completa para um vídeo baseado nas imagens e prompt fornecidos.

Responda SEMPRE em português brasileiro.

Retorne um JSON com a seguinte estrutura:
{
  "title": "Título do criativo",
  "script": "Roteiro completo cena a cena",
  "scenes": [
    {
      "number": 1,
      "duration": "3s",
      "description": "Descrição visual detalhada",
      "text_overlay": "Texto que aparece na tela",
      "transition": "Tipo de transição"
    }
  ],
  "music_suggestion": "Sugestão de música/áudio",
  "total_duration": "Duração total estimada",
  "creative_notes": "Notas criativas adicionais"
}`;

    if (isUGC) {
      systemPrompt += `\n\nEste é um criativo no estilo UGC (User Generated Content). 
Aplique TODOS os seguintes aspectos essenciais de um UGC profissional:

${UGC_ASPECTS.map((a, i) => `${i + 1}. ${a}`).join("\n")}

O vídeo deve parecer autêntico e orgânico, como se fosse feito por um usuário real, 
mas com qualidade profissional de produção. Inclua no roteiro instruções específicas 
para cada um desses aspectos.`;
    }

    const userMessage = `Modelo: ${model || "Geral"}
Aspecto: ${aspect || "9:16 (Vertical)"}
Prompt do usuário: ${prompt || "Criar um criativo impactante"}
${imageDescriptions?.length ? `\nImagens conectadas (${imageDescriptions.length}):\n${imageDescriptions.map((d: string, i: number) => `- Imagem ${i + 1}: ${d}`).join("\n")}` : "Nenhuma imagem conectada."}

Gere o roteiro criativo completo.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar criativo com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to extract JSON from the response
    let creative;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        creative = JSON.parse(jsonMatch[0]);
      } else {
        creative = { script: content, title: "Criativo Gerado", scenes: [], creative_notes: content };
      }
    } catch {
      creative = { script: content, title: "Criativo Gerado", scenes: [], creative_notes: content };
    }

    // Add UGC aspects if UGC model
    if (isUGC) {
      creative.ugc_aspects = UGC_ASPECTS;
    }

    return new Response(JSON.stringify({ creative }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-video-creative error:", e);
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
