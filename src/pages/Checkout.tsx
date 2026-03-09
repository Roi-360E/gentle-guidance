import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Check, Loader2, Copy, CheckCircle2, Shield, Lock, 
  Zap, Clock, CreditCard, QrCode, Sparkles, Crown, Star
} from 'lucide-react';
import { toast } from 'sonner';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { motion, AnimatePresence } from 'framer-motion';

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
}

const ICON_MAP: Record<string, any> = { Sparkles, Zap, Crown };

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planKey = searchParams.get('plan') || '';
  
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'checkout' | 'pix'>('checkout');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState(false);
  const [countdown, setCountdown] = useState(15 * 60);

  // Load plan
  useEffect(() => {
    if (!planKey) { navigate('/plans'); return; }
    console.log('[Checkout] Loading plan:', planKey);
    supabase
      .from('subscription_plans' as any)
      .select('*')
      .eq('plan_key', planKey)
      .eq('is_active', true)
      .single()
      .then(({ data, error }) => {
        console.log('[Checkout] Plan query result:', { data, error });
        if (error || !data) { 
          console.error('[Checkout] Plan not found:', error);
          toast.error('Plano não encontrado'); 
          navigate('/plans'); 
          return; 
        }
        const p = data as any;
        setPlan({
          ...p,
          features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
        });
        setPlanLoading(false);
        trackPixelEvent('InitiateCheckout', {
          content_name: p.name,
          value: p.price,
          currency: 'BRL',
        }, user?.id);
      });
  }, [planKey]);

  // Check payment return from Checkout Pro
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (!paymentStatus) return;
    if (paymentStatus === 'success') {
      navigate('/obrigado', { replace: true });
    } else if (paymentStatus === 'failure') {
      toast.error('Pagamento não aprovado. Tente novamente.');
    } else if (paymentStatus === 'pending') {
      toast.info('Pagamento pendente. Será ativado assim que confirmado.');
    }
  }, [searchParams]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Poll Pix
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
        const pixKey = localStorage.getItem('pix_plan_key') || '';
        const pixName = localStorage.getItem('pix_plan_name') || '';
        const pixValue = localStorage.getItem('pix_plan_value') || '0';
        localStorage.setItem('checkout_plan_key', pixKey);
        localStorage.setItem('checkout_plan_name', pixName);
        localStorage.setItem('checkout_plan_value', pixValue);
        localStorage.setItem('checkout_method', 'Pix');
        localStorage.removeItem('pix_plan_key');
        localStorage.removeItem('pix_plan_name');
        localStorage.removeItem('pix_plan_value');
        navigate('/obrigado');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [pixData, pollingPayment]);

  const handlePay = async () => {
    if (!user || !plan) return;
    setLoading(true);

    trackPixelEvent('AddPaymentInfo', {
      content_name: plan.name,
      content_category: selectedMethod === 'pix' ? 'Pix' : 'Cartão/Boleto',
      value: plan.price,
      currency: 'BRL',
    }, user.id);

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
        body: JSON.stringify({ plan: planKey, paymentMethod: selectedMethod === 'pix' ? 'pix' : undefined }),
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
        localStorage.setItem('pix_plan_key', planKey);
        localStorage.setItem('pix_plan_name', plan.name);
        localStorage.setItem('pix_plan_value', String(plan.price));
      } else if (data.type === 'checkout') {
        localStorage.setItem('checkout_plan_key', planKey);
        localStorage.setItem('checkout_plan_name', plan.name);
        localStorage.setItem('checkout_plan_value', String(plan.price));
        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = data.initPoint;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    if (!pixData?.qrCode) return;
    navigator.clipboard.writeText(pixData.qrCode);
    setCopied(true);
    toast.success('Código Pix copiado!');
    setTimeout(() => setCopied(false), 3000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plan) return null;

  const Icon = ICON_MAP[plan.icon] || Sparkles;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/plans')} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1" /> Planos
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Checkout Seguro</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        {/* Urgency bar */}
        {countdown > 0 && !pixData && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-center gap-2 text-sm"
          >
            <Clock className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-muted-foreground">Oferta expira em</span>
            <span className="font-bold text-primary font-mono">{formatTime(countdown)}</span>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Payment */}
          <div className="lg:col-span-3 space-y-6">
            <AnimatePresence mode="wait">
              {pixData ? (
                <motion.div
                  key="pix-payment"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-border bg-card p-6 space-y-5"
                >
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <QrCode className="w-7 h-7 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Pagamento via Pix</h2>
                    <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código abaixo</p>
                  </div>

                  {pixData.qrCodeBase64 && (
                    <div className="flex justify-center">
                      <div className="bg-white rounded-2xl p-4">
                        <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-52 h-52" />
                      </div>
                    </div>
                  )}

                  {pixData.qrCode && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Código Pix Copia e Cola</label>
                      <div className="relative">
                        <textarea 
                          readOnly 
                          value={pixData.qrCode} 
                          className="w-full h-20 text-xs bg-muted rounded-xl p-3 resize-none border border-border font-mono" 
                        />
                        <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={copyPixCode}>
                          {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                          {copied ? 'Copiado!' : 'Copiar'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {pollingPayment && (
                    <div className="flex items-center justify-center gap-2 text-sm text-primary bg-primary/5 rounded-xl py-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Aguardando confirmação do pagamento...
                    </div>
                  )}

                  <Button variant="ghost" className="w-full" onClick={() => { setPixData(null); setPollingPayment(false); }}>
                    ← Voltar para métodos de pagamento
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="payment-methods"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <h2 className="text-xl font-bold text-foreground">Escolha o método de pagamento</h2>

                  {/* Payment method selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedMethod('checkout')}
                      className={`relative rounded-xl border-2 p-4 transition-all text-left ${
                        selectedMethod === 'checkout'
                          ? 'border-primary bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]'
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <CreditCard className={`w-5 h-5 ${selectedMethod === 'checkout' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="font-semibold text-sm text-foreground">Cartão / Boleto</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Parcelamento disponível</p>
                      {selectedMethod === 'checkout' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedMethod('pix')}
                      className={`relative rounded-xl border-2 p-4 transition-all text-left ${
                        selectedMethod === 'pix'
                          ? 'border-primary bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]'
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <QrCode className={`w-5 h-5 ${selectedMethod === 'pix' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="font-semibold text-sm text-foreground">Pix</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Aprovação instantânea</p>
                      {selectedMethod === 'pix' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>

                  {/* CTA Button */}
                  <Button
                    onClick={handlePay}
                    disabled={loading}
                    className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] transition-all hover:shadow-[0_0_40px_-5px_hsl(var(--primary)/0.6)]"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <Lock className="w-5 h-5 mr-2" />
                    )}
                    {loading
                      ? 'Processando...'
                      : selectedMethod === 'pix'
                      ? `Pagar R$ ${plan.price.toFixed(2).replace('.', ',')} com Pix`
                      : `Pagar R$ ${plan.price.toFixed(2).replace('.', ',')} com Cartão`
                    }
                  </Button>

                  {/* Trust badges */}
                  <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Shield className="w-4 h-4 text-primary" />
                      Pagamento 100% seguro
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      Garantia de 7 dias
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Zap className="w-4 h-4 text-primary" />
                      Ativação instantânea
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Order summary */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 lg:sticky lg:top-24">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumo do pedido</h3>

              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className={`rounded-xl p-2.5 ${plan.bg_color}`}>
                  <Icon className={`w-6 h-6 ${plan.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {plan.tokens >= 999999 ? '∞ tokens' : `${plan.tokens} tokens`} / mês
                  </p>
                </div>
                {plan.is_popular && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                    <Star className="w-3 h-3 mr-1" /> Popular
                  </Badge>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 pb-4 border-b border-border">
                {plan.features.slice(0, 5).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
                {plan.features.length > 5 && (
                  <li className="text-xs text-primary pl-5">+{plan.features.length - 5} benefícios inclusos</li>
                )}
              </ul>

              {/* Price */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plano {plan.name}</span>
                  <span className="text-foreground">R$ {plan.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">R$ {plan.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <p className="text-[11px] text-muted-foreground text-right">cobrado mensalmente</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
