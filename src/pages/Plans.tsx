import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useVideoUsage } from '@/hooks/useVideoUsage';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Zap, Crown, ArrowLeft, Check, Lock } from 'lucide-react';

const plans = [
  {
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    description: 'Ideal para testar a plataforma',
    limit: 100,
    icon: Sparkles,
    features: [
      '100 vídeos por mês',
      'Upload de ganchos, corpos e CTAs',
      'Download dos vídeos gerados',
      'Configurações de processamento',
    ],
    current: true,
    highlight: false,
    cta: 'Plano Atual',
  },
  {
    name: 'Profissional',
    price: 'R$ 97',
    period: '/mês',
    description: 'Para produtores de conteúdo',
    limit: 1000,
    icon: Zap,
    features: [
      '1.000 vídeos por mês',
      'Tudo do plano Gratuito',
      'Editor de Legendas com IA ✨',
      'Processamento prioritário',
      'Suporte por e-mail',
    ],
    current: false,
    highlight: true,
    cta: 'Assinar Profissional',
  },
  {
    name: 'Empresarial',
    price: 'R$ 297',
    period: '/mês',
    description: 'Para agências e equipes',
    limit: Infinity,
    icon: Crown,
    features: [
      'Vídeos ilimitados',
      'Tudo do plano Profissional',
      'Andromeda META ADS',
      'Dashboard de Resultados',
      'Suporte prioritário 24/7',
      'API de integração',
    ],
    current: false,
    highlight: false,
    cta: 'Assinar Empresarial',
  },
];

const Plans = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { videoCount, limit, remaining, plan } = useVideoUsage();

  const usagePercent = limit === Infinity ? 0 : Math.min(100, (videoCount / limit) * 100);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight text-primary uppercase">
              Planos
            </h1>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {/* Current usage card */}
        <div className="max-w-lg mx-auto rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 rounded-xl p-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">Seu Plano: <span className="capitalize">{plan}</span></p>
              <p className="text-sm text-muted-foreground">
                {videoCount} de {limit === Infinity ? '∞' : limit} vídeos usados este mês
              </p>
            </div>
          </div>
          {limit !== Infinity && (
            <div className="space-y-1">
              <Progress value={usagePercent} className="h-3" />
              <p className="text-xs text-muted-foreground text-right">
                {remaining} vídeos restantes
              </p>
            </div>
          )}
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Escolha o plano ideal para você
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Escale sua produção de criativos com o plano que melhor se adapta às suas necessidades.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 flex flex-col gap-5 transition-all ${
                p.highlight
                  ? 'border-primary bg-card shadow-lg shadow-primary/10 scale-[1.02]'
                  : 'border-border bg-card'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide">
                  Mais Popular
                </span>
              )}
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-3 ${p.highlight ? 'bg-primary/20' : 'bg-muted'}`}>
                  <p.icon className={`w-6 h-6 ${p.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-bold text-lg text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </div>

              <div className="flex items-end gap-1">
                <span className="text-4xl font-extrabold text-foreground">{p.price}</span>
                <span className="text-muted-foreground text-sm mb-1">{p.period}</span>
              </div>

              <ul className="space-y-2.5 flex-1">
                {p.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-foreground">{feat}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full rounded-full font-semibold ${
                  p.current
                    ? 'border border-border bg-muted text-muted-foreground cursor-default'
                    : p.highlight
                    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90'
                    : ''
                }`}
                variant={p.current ? 'outline' : p.highlight ? 'default' : 'outline'}
                disabled={p.current}
                onClick={() => {
                  if (!p.current) {
                    // TODO: Implement payment flow
                    window.open('https://pay.hotmart.com', '_blank');
                  }
                }}
              >
                {p.current ? (
                  <>{p.cta}</>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    {p.cta}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto text-center space-y-3 pb-10">
          <p className="text-sm text-muted-foreground">
            Todos os planos incluem acesso à plataforma de combinação de vídeos.
            Ao atingir o limite mensal, seus vídeos continuam disponíveis para download.
          </p>
          <p className="text-xs text-muted-foreground">
            Dúvidas? Entre em contato pelo suporte dentro da plataforma.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Plans;
