import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Zap,
  Rocket,
  ShieldCheck,
  Clock,
  TrendingUp,
  Repeat2,
  Layers,
  Film,
  Megaphone,
  ArrowRight,
  CheckCircle2,
  Gift,
  Star,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

/* ───────────────────────── helpers ───────────────────────── */

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`max-w-5xl mx-auto px-4 sm:px-6 ${className}`}>{children}</section>
);

const GlowCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl border border-primary/20 bg-card/80 backdrop-blur-sm p-6 sm:p-8 ${className}`}
    style={{ boxShadow: '0 0 40px -12px hsl(265 90% 55% / 0.15)' }}
  >
    {children}
  </div>
);

/* ───────────────────────── data ───────────────────────── */

const mechanismItems = [
  {
    icon: Film,
    title: 'Troca Dinâmica de Hooks',
    desc: 'Altere apenas os primeiros 3 segundos — onde o ROI é decidido — em massa.',
  },
  {
    icon: Layers,
    title: 'Variação de Backgrounds',
    desc: 'Teste fundos diferentes para o mesmo apresentador com um clique.',
  },
  {
    icon: ShieldCheck,
    title: 'Metadados Únicos',
    desc: 'Cada vídeo gerado é "novo" para o algoritmo do Facebook/TikTok, evitando bloqueios por repetição.',
  },
  {
    icon: Megaphone,
    title: 'CTAs Infinitas',
    desc: 'Teste 10 chamadas diferentes para ver qual realmente põe dinheiro no bolso.',
  },
];

const painTable = [
  {
    problem: 'CPA subindo porque o público "cansou" do vídeo.',
    solution: 'Criativos renovados diariamente sem gravar nada novo.',
  },
  {
    problem: 'Horas editando variações no CapCut ou Premiere.',
    solution: 'Processamento em massa em menos de 60 segundos.',
  },
  {
    problem: 'Dependência de editores caros e lentos.',
    solution: 'Autonomia total para o Gestor de Tráfego.',
  },
  {
    problem: 'Bloqueios por "Conteúdo Repetitivo".',
    solution: 'Limpeza automática de rastros digitais (MD5).',
  },
];

const bonuses = [
  {
    icon: Rocket,
    title: 'Biblioteca de Ganchos de Alta Retenção',
    desc: 'Copy pronta para copiar e adaptar nos primeiros 3 segundos dos seus criativos.',
  },
  {
    icon: TrendingUp,
    title: 'Curso: 0 aos R$ 10k/dia com Criativos Infinitos',
    desc: 'Passo a passo para escalar campanhas usando variações inteligentes de criativos.',
  },
  {
    icon: Repeat2,
    title: 'Template N8N — Alertas de CPA',
    desc: 'Automação pronta que avisa quando seu CPA sobe para você agir antes de perder dinheiro.',
  },
];

/* ───────────────────────── component ───────────────────────── */

export default function Sales() {
  const navigate = useNavigate();
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const scrollToCTA = () => {
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ─── Sticky mini-bar ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            <span className="text-lg font-extrabold tracking-tight text-primary uppercase">EscalaXPro</span>
          </div>
          <Button size="sm" className="rounded-full gap-1.5" onClick={scrollToCTA}>
            Quero Acesso <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ════════════════════ 1. HERO ════════════════════ */}
      <section className="relative py-16 sm:py-24">
        {/* glow bg */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, hsl(265 90% 55% / 0.12) 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-6">
          <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            A Nova Era da Escala de Anúncios Chegou
          </span>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black leading-[1.1] tracking-tight">
            Multiplique{' '}
            <span className="text-primary">1 Criativo Vencedor</span> em{' '}
            <span className="text-primary">50 Variações Lucrativas</span> em Segundos
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Pare de ser escravo da edição manual. O EscalaXPro automatiza a criação de
            <strong className="text-foreground"> Ganchos, Corpos e CTAs </strong>
            para você dominar o leilão e reduzir seu CPA drasticamente.
          </p>

          {/* VSL placeholder */}
          <div className="relative mx-auto max-w-2xl aspect-video rounded-2xl border-2 border-primary/30 bg-card overflow-hidden group cursor-pointer">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 sm:w-9 sm:h-9 text-primary ml-1">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="text-xs text-muted-foreground">🔇 Clique para ouvir</span>
            </div>
          </div>

          <Button size="lg" className="rounded-full gap-2 text-base px-8 mt-4" onClick={scrollToCTA}>
            <Zap className="w-5 h-5" /> Quero o EscalaXPro Agora
          </Button>
        </div>
      </section>

      {/* ════════════════════ 2. MECANISMO ÚNICO ════════════════════ */}
      <Section className="py-16 sm:py-20 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-4xl font-black">
            Como o EscalaXPro <span className="text-primary">Destrói</span> a Fadiga do Seu Anúncio
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Não é um editor. É um <strong className="text-foreground">motor de escala</strong> projetado para
            dominar o leilão.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {mechanismItems.map((item) => {
            const Icon = item.icon;
            return (
              <GlowCard key={item.title} className="flex gap-4 items-start">
                <div className="shrink-0 rounded-xl bg-primary/15 p-3">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </GlowCard>
            );
          })}
        </div>
      </Section>

      {/* ════════════════════ 3. DOR → SOLUÇÃO ════════════════════ */}
      <Section className="py-16 sm:py-20 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-4xl font-black">
            Para Quem é o <span className="text-primary">EscalaXPro</span>?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Se você se identifica com algum desses problemas, o EscalaXPro foi feito pra você.
          </p>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden">
          {/* header */}
          <div className="grid grid-cols-2 bg-primary/10 border-b border-border">
            <div className="px-4 sm:px-6 py-3 text-sm font-bold text-primary uppercase tracking-wide">
              ❌ O Problema Atual
            </div>
            <div className="px-4 sm:px-6 py-3 text-sm font-bold text-primary uppercase tracking-wide">
              ✅ A Solução EscalaXPro
            </div>
          </div>
          {painTable.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-2 ${i < painTable.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="px-4 sm:px-6 py-4 text-sm text-muted-foreground">{row.problem}</div>
              <div className="px-4 sm:px-6 py-4 text-sm text-foreground font-medium">{row.solution}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ════════════════════ 4. PROVA SOCIAL ════════════════════ */}
      <Section className="py-16 sm:py-20 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-4xl font-black">
            O EscalaXPro <span className="text-primary">em Ação</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Veja como gestores de tráfego estão escalando seus resultados.
          </p>
        </div>

        {/* Mockup */}
        <GlowCard className="max-w-2xl mx-auto text-center space-y-4">
          <div className="aspect-video rounded-xl bg-secondary/60 border border-border flex items-center justify-center">
            <div className="text-center space-y-2">
              <Rocket className="w-10 h-10 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Dashboard processando 50 variações...</p>
              <div className="w-48 h-2 rounded-full bg-muted mx-auto overflow-hidden">
                <div className="h-full w-3/4 rounded-full bg-primary animate-pulse" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Interface real do EscalaXPro — Upload → Pré-processamento → Combinações prontas em segundos.
          </p>
        </GlowCard>

        {/* Testimonials grid */}
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            { name: 'Rafael M.', role: 'Gestor de Tráfego', text: 'CTR de 1.2% foi pra 3.8% só trocando hooks com o EscalaXPro. Nunca mais edito manualmente.' },
            { name: 'Juliana S.', role: 'Media Buyer', text: 'Economizo 15h por semana que gastava fazendo variações no Premiere. O CPA caiu 40%.' },
            { name: 'Lucas P.', role: 'Agência de Performance', text: 'Testamos 200 variações em um dia. Encontramos 3 criativos que sozinhos faturam R$ 50k/mês.' },
          ].map((t) => (
            <GlowCard key={t.name} className="space-y-3">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">"{t.text}"</p>
              <div>
                <p className="font-bold text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </GlowCard>
          ))}
        </div>
      </Section>

      {/* ════════════════════ 5. OFERTA + BÔNUS ════════════════════ */}
      <Section className="py-16 sm:py-20 space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-4xl font-black">
            Tudo Que Você Recebe <span className="text-primary">Hoje</span>
          </h2>
        </div>

        {/* Main offer */}
        <GlowCard className="max-w-2xl mx-auto space-y-5 text-center border-primary/40">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/30 px-4 py-1.5 text-sm font-semibold text-primary">
            <Zap className="w-4 h-4" /> Oferta de Lançamento
          </div>
          <h3 className="text-xl sm:text-2xl font-black">Acesso Completo ao EscalaX</h3>
          <ul className="text-left max-w-sm mx-auto space-y-2.5">
            {[
              'Combinações ilimitadas de Hooks + Corpos + CTAs',
              'Pré-processamento inteligente (remuxing ultrarrápido)',
              'Limpeza de metadados (MD5) automática',
              'Exportação em massa (9:16, 16:9, 1:1)',
              'Legendas com IA (em breve)',
              'Atualizações vitalícias',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </GlowCard>

        {/* Bonuses */}
        <div className="grid sm:grid-cols-3 gap-5">
          {bonuses.map((b, i) => {
            const Icon = b.icon;
            return (
              <GlowCard key={b.title} className="space-y-3 relative overflow-hidden">
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                    <Gift className="w-3 h-3" /> Bônus {i + 1}
                  </span>
                </div>
                <div className="rounded-xl bg-primary/15 p-3 w-fit">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-bold">{b.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </GlowCard>
            );
          })}
        </div>
      </Section>

      {/* ════════════════════ 6. CHECKOUT + GARANTIA ════════════════════ */}
      <section id="checkout" className="py-16 sm:py-24">
        <div className="max-w-lg mx-auto px-4 space-y-8 text-center">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black">
              Comece a Escalar <span className="text-primary">Agora</span>
            </h2>
            <p className="text-muted-foreground">
              Acesso imediato. Sem mensalidade surpresa. Cancele quando quiser.
            </p>
          </div>

          {/* Price anchor */}
          <GlowCard className="border-primary/40 space-y-4">
            <p className="text-sm text-muted-foreground line-through">De R$ 497,00</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl sm:text-5xl font-black text-primary">R$ 197</span>
              <span className="text-muted-foreground text-sm">/acesso</span>
            </div>
            <p className="text-xs text-muted-foreground">ou 12x de R$ 19,67</p>

            <Button
              size="lg"
              className="w-full rounded-full text-base gap-2 py-6"
              onClick={() => navigate('/auth')}
            >
              <Zap className="w-5 h-5" /> QUERO O ESCALAX COM DESCONTO DE LANÇAMENTO
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Pagamento 100% seguro via Mercado Pago
            </div>
          </GlowCard>

          {/* Guarantee */}
          <GlowCard className="flex items-start gap-4 text-left">
            <div className="shrink-0 rounded-full bg-primary/15 p-3">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold">Garantia Incondicional de 7 Dias</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Se você não sentir que economizou 20 horas de edição na primeira semana, eu estorno seu
                pagamento. Sem perguntas, sem burocracia.
              </p>
            </div>
          </GlowCard>
        </div>
      </section>

      {/* ════════════════════ FAQ ════════════════════ */}
      <Section className="py-16 sm:py-20 space-y-8">
        <h2 className="text-2xl sm:text-3xl font-black text-center">Perguntas Frequentes</h2>
        <div className="max-w-2xl mx-auto space-y-3">
          {[
            { q: 'Preciso saber editar vídeos?', a: 'Não! O EscalaX faz todo o trabalho pesado. Basta fazer upload dos seus clipes e ele gera as combinações automaticamente.' },
            { q: 'Funciona no celular?', a: 'Sim, o EscalaX roda direto no navegador. Funciona em qualquer dispositivo com internet.' },
            { q: 'E se meu criativo for bloqueado?', a: 'O EscalaX limpa automaticamente os metadados (MD5) de cada vídeo gerado, fazendo com que a plataforma de ads trate cada variação como um arquivo totalmente novo.' },
            { q: 'Quanto tempo leva para gerar as variações?', a: 'O processamento em massa é feito em menos de 60 segundos para a maioria dos lotes, dependendo da quantidade e tamanho dos vídeos.' },
          ].map((item, i) => (
            <button
              key={i}
              onClick={() => setFaqOpen(faqOpen === i ? null : i)}
              className="w-full text-left rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-sm">{item.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`}
                />
              </div>
              {faqOpen === i && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer className="border-t border-border py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Rocket className="w-5 h-5 text-primary" />
          <span className="font-extrabold text-primary uppercase tracking-tight">EscalaXPro</span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} EscalaX. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
