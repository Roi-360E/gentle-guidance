import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, Crown, ArrowLeft, Check, Loader2, Copy, CheckCircle2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { trackPixelEvent } from '@/lib/pixel-tracker';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-checkout`;

interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  paymentId: string;
  mpPaymentId: number;
  expiresAt: string;
}

interface PlanData {
  id: string;
  plan_key: string;
  name: string;
  price: number;
  tokens: number;
  features: string[];
  icon: string;
  color: string;
  bg_color: string;
  is_popular: boolean;
  sort_order: number;
}

const ICON_MAP: Record<string, any> = { Sparkles, Zap, Crown };

export default function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load plans from database
  useEffect(() => {
    supabase
      .from('subscription_plans' as any)
      .select('*')
      .order('price', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setPlans((data as any[]).map((p: any) => ({
            ...p,
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
          })));
        }
        setPlansLoading(false);
      });

    // Track ViewContent on plans page
    trackPixelEvent('ViewContent', {
      content_name: 'Plans Page',
      content_category: 'Pricing',
    });
  }, []);

  // Check admin role
  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .then(({ data }) => {
        if (data && (data as any[]).length > 0) setIsAdmin(true);
      });
  }, [user]);

  // Check payment return from Checkout Pro
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      toast.success('Pagamento aprovado! Seu plano foi ativado.');
      trackPixelEvent('AddPaymentInfo', {
        content_category: 'Cartão/Boleto',
        currency: 'BRL',
      }, user?.id);
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

  const handleCheckout = async (planKey: string, method: 'checkout' | 'pix') => {
    if (!user) {
      toast.error('Faça login para continuar.');
      return;
    }
    setLoading(`${planKey}-${method}`);

    // Track InitiateCheckout event on Facebook Pixel
    if (typeof window !== 'undefined' && (window as any).fbq) {
      const plan = plans.find(p => p.plan_key === planKey);
      (window as any).fbq('track', 'InitiateCheckout', {
        content_name: plan?.name || planKey,
        content_category: method === 'pix' ? 'Pix' : 'Cartão/Boleto',
        value: plan?.price || 0,
        currency: 'BRL',
      });
    }
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
        body: JSON.stringify({ plan: planKey, paymentMethod: method === 'pix' ? 'pix' : undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      if (data.type === 'pix') {
        setPixData({ qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64, paymentId: data.paymentId, mpPaymentId: data.mpPaymentId, expiresAt: data.expiresAt });
        setPollingPayment(true);

        // Track AddPaymentInfo when Pix QR code is generated
        if (typeof window !== 'undefined' && (window as any).fbq) {
          const plan = plans.find(p => p.plan_key === planKey);
          (window as any).fbq('track', 'AddPaymentInfo', {
            content_name: plan?.name || planKey,
            content_category: 'Pix',
            value: plan?.price || 0,
            currency: 'BRL',
          });
        }
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

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Voltar</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-foreground truncate">Planos e Pagamento</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Escolha o melhor plano para você</p>
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/plans')}>
              <Settings className="w-4 h-4 mr-1" /> Editar Planos
            </Button>
          )}
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
                    <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-56 h-56 rounded-lg border border-border" />
                  </div>
                )}
                {pixData.qrCode && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Código Pix Copia e Cola:</p>
                    <div className="relative">
                      <textarea readOnly value={pixData.qrCode} className="w-full h-20 text-xs bg-muted rounded-lg p-3 resize-none border border-border" />
                      <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={copyPixCode}>
                        {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}
                {pollingPayment && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Aguardando confirmação do pagamento...
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={() => { setPixData(null); setPollingPayment(false); }}>Fechar</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = ICON_MAP[plan.icon] || Sparkles;
            const isCurrent = currentPlan === plan.plan_key;

            return (
              <Card
                key={plan.id}
                className={`relative transition-all ${plan.is_popular ? 'ring-2 ring-primary shadow-lg scale-[1.02]' : ''} ${isCurrent ? 'border-primary' : ''}`}
              >
                {plan.is_popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">Mais Popular</Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <div className={`mx-auto rounded-xl p-3 w-fit ${plan.bg_color}`}>
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
                      {plan.tokens >= 999999 ? '∞ tokens' : `${plan.tokens} tokens`}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className={`w-4 h-4 ${plan.color} shrink-0`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Badge variant="outline" className="w-full justify-center py-2">Plano Atual</Badge>
                  ) : (
                    <div className="space-y-2">
                      {isAdmin && (
                        <Button
                          className="w-full" variant="secondary"
                          disabled={loading === `admin-${plan.plan_key}`}
                          onClick={async () => {
                            setLoading(`admin-${plan.plan_key}`);
                            try {
                              const monthYear = new Date().toISOString().substring(0, 7);
                              const tokenBalance = plan.tokens >= 999999 ? 999999 : plan.tokens;
                              const { data: updateData, error: updateError } = await supabase
                                .from('video_usage')
                                .update({ plan: plan.plan_key, token_balance: tokenBalance })
                                .eq('user_id', user!.id)
                                .eq('month_year', monthYear)
                                .select();
                              if (updateError) { toast.error('Erro: ' + updateError.message); return; }
                              if (!updateData || updateData.length === 0) {
                                const { error: insertError } = await supabase
                                  .from('video_usage')
                                  .insert({ user_id: user!.id, month_year: monthYear, plan: plan.plan_key, token_balance: tokenBalance, video_count: 0 });
                                if (insertError) { toast.error('Erro: ' + insertError.message); return; }
                              }
                              setCurrentPlan(plan.plan_key);
                              toast.success(`Plano alterado para ${plan.name}!`);
                            } catch { toast.error('Erro inesperado.'); } finally { setLoading(null); }
                          }}
                        >
                          {loading === `admin-${plan.plan_key}` ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          ⚡ Ativar {plan.name}
                        </Button>
                      )}
                      {plan.price > 0 && (
                        <>
                          <Button className="w-full" onClick={() => handleCheckout(plan.plan_key, 'checkout')} disabled={!!loading}>
                            {loading === `${plan.plan_key}-checkout` ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Pagar com Cartão/Boleto
                          </Button>
                          <Button variant="outline" className="w-full" onClick={() => handleCheckout(plan.plan_key, 'pix')} disabled={!!loading}>
                            {loading === `${plan.plan_key}-pix` ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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
