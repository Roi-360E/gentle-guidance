import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, Crown, ArrowLeft, Check, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-checkout`;

interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  paymentId: string;
  mpPaymentId: number;
  expiresAt: string;
}

const plans = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 0,
    tokens: 50,
    icon: Sparkles,
    features: ['50 tokens iniciais', 'Processamento local', 'Suporte básico'],
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
  },
  {
    id: 'professional',
    name: 'Profissional',
    price: 37.90,
    tokens: 200,
    icon: Zap,
    features: ['200 tokens/mês', 'Processamento local', 'Suporte prioritário'],
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Empresarial',
    price: 197,
    tokens: Infinity,
    icon: Crown,
    features: ['Tokens ilimitados', 'Processamento em nuvem', 'Chat gerador de roteiros', 'API dedicada', 'Suporte VIP'],
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
];

export default function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);

  // Check payment return from Checkout Pro
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      toast.success('Pagamento aprovado! Seu plano foi ativado.');
    } else if (paymentStatus === 'failure') {
      toast.error('Pagamento não aprovado. Tente novamente.');
    } else if (paymentStatus === 'pending') {
      toast.info('Pagamento pendente. Será ativado assim que confirmado.');
    }
  }, [searchParams]);

  // Load current plan
  useEffect(() => {
    if (!user) return;
    const monthYear = new Date().toISOString().substring(0, 7);
    supabase
      .from('video_usage')
      .select('plan')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .single()
      .then(({ data }) => {
        if (data?.plan) setCurrentPlan(data.plan);
      });
  }, [user]);

  // Poll for Pix payment confirmation
  useEffect(() => {
    if (!pixData || !pollingPayment) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('payments')
        .select('status')
        .eq('id', pixData.paymentId)
        .single();

      if (data?.status === 'confirmed') {
        setPollingPayment(false);
        setPixData(null);
        toast.success('Pagamento Pix confirmado! Plano ativado.');
        // Reload current plan
        const monthYear = new Date().toISOString().substring(0, 7);
        const { data: usage } = await supabase
          .from('video_usage')
          .select('plan')
          .eq('user_id', user!.id)
          .eq('month_year', monthYear)
          .single();
        if (usage?.plan) setCurrentPlan(usage.plan);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pixData, pollingPayment, user]);

  const handleCheckout = async (planId: string, method: 'checkout' | 'pix') => {
    if (!user) {
      toast.error('Faça login para continuar.');
      return;
    }

    setLoading(`${planId}-${method}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          plan: planId,
          paymentMethod: method === 'pix' ? 'pix' : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();

      if (data.type === 'pix') {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          paymentId: data.paymentId,
          mpPaymentId: data.mpPaymentId,
          expiresAt: data.expiresAt,
        });
        setPollingPayment(true);
      } else if (data.type === 'checkout') {
        window.location.href = data.initPoint;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setLoading(null);
    }
  };

  const copyPixCode = () => {
    if (!pixData?.qrCode) return;
    navigator.clipboard.writeText(pixData.qrCode);
    setCopied(true);
    toast.success('Código Pix copiado!');
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="shrink-0 px-2 sm:px-3">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-foreground truncate">Planos e Pagamento</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Escolha o melhor plano para você</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Pix payment modal */}
        {pixData && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <Card className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Pagamento via Pix</CardTitle>
                <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {pixData.qrCodeBase64 && (
                  <div className="flex justify-center">
                    <img
                      src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                      alt="QR Code Pix"
                      className="w-56 h-56 rounded-lg border border-border"
                    />
                  </div>
                )}

                {pixData.qrCode && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Código Pix Copia e Cola:</p>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={pixData.qrCode}
                        className="w-full h-20 text-xs bg-muted rounded-lg p-3 resize-none border border-border"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute top-2 right-2"
                        onClick={copyPixCode}
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                {pollingPayment && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aguardando confirmação do pagamento...
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPixData(null);
                    setPollingPayment(false);
                  }}
                >
                  Fechar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative transition-all ${
                  plan.popular ? 'ring-2 ring-primary shadow-lg scale-[1.02]' : ''
                } ${isCurrent ? 'border-primary' : ''}`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Mais Popular
                  </Badge>
                )}

                <CardHeader className="text-center pb-2">
                  <div className={`mx-auto rounded-xl p-3 w-fit ${plan.bgColor}`}>
                    <Icon className={`w-6 h-6 ${plan.color}`} />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="mt-2">
                    {plan.price > 0 ? (
                      <div>
                        <span className="text-3xl font-bold">R$ {plan.price.toFixed(2).replace('.', ',')}</span>
                        <span className="text-muted-foreground text-sm">/mês</span>
                      </div>
                    ) : (
                      <span className="text-3xl font-bold">Grátis</span>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.tokens === Infinity ? '∞ tokens' : `${plan.tokens} tokens`}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className={`w-4 h-4 ${plan.color} shrink-0`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Badge variant="outline" className="w-full justify-center py-2">
                      Plano Atual
                    </Badge>
                  ) : (
                    <div className="space-y-2">
                      {user?.email === 'matheuslaurindo900@gmail.com' && (
                        <Button
                          className="w-full"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              const monthYear = new Date().toISOString().substring(0, 7);
                              console.log('[Admin] Tentando alterar plano para:', plan.id, 'user:', user.id, 'month:', monthYear);
                              
                              const { data: updateData, error, count } = await supabase
                                .from('video_usage')
                                .update({ plan: plan.id })
                                .eq('user_id', user.id)
                                .eq('month_year', monthYear)
                                .select();
                              
                              console.log('[Admin] Resultado update:', { updateData, error, count });
                              
                              if (error) {
                                console.error('[Admin] Erro no update:', error);
                                toast.error('Erro ao alterar plano: ' + error.message);
                                return;
                              }
                              
                              if (!updateData || updateData.length === 0) {
                                console.error('[Admin] Nenhuma linha atualizada! Verifique user_id e month_year.');
                                toast.error('Nenhum registro encontrado para atualizar.');
                                return;
                              }
                              
                              console.log('[Admin] Plano atualizado com sucesso:', updateData[0]?.plan);
                              setCurrentPlan(plan.id);
                              toast.success(`Plano alterado para ${plan.name}!`);
                            } catch (err) {
                              console.error('[Admin] Erro inesperado:', err);
                              toast.error('Erro inesperado ao alterar plano.');
                            }
                          }}
                        >
                          ⚡ Ativar {plan.name}
                        </Button>
                      )}
                      {plan.price > 0 && (
                        <>
                          <Button
                            className="w-full"
                            onClick={() => handleCheckout(plan.id, 'checkout')}
                            disabled={!!loading}
                          >
                            {loading === `${plan.id}-checkout` ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Pagar com Cartão/Boleto
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleCheckout(plan.id, 'pix')}
                            disabled={!!loading}
                          >
                            {loading === `${plan.id}-pix` ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Pagar com Pix
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>Pagamento processado de forma segura pelo Mercado Pago.</p>
          <p>Após a confirmação, seu plano é ativado automaticamente.</p>
        </div>
      </main>
    </div>
  );
}
