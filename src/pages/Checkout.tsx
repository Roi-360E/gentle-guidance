import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Check, Loader2, Copy, CheckCircle2, Shield, Lock, 
  Zap, Clock, CreditCard, QrCode, Sparkles, Crown, Star, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { motion, AnimatePresence } from 'framer-motion';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-checkout`;
const PUBLIC_KEY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-public-key`;

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

// Load MP SDK script once — isolated to avoid conflicts with Facebook Pixel (fbq)
let mpSdkPromise: Promise<any> | null = null;
function loadMPSdk(publicKey: string): Promise<any> {
  if (mpSdkPromise) return mpSdkPromise;
  mpSdkPromise = new Promise((resolve, reject) => {
    // Preserve existing fbq reference before loading any external SDK
    const existingFbq = (window as any).fbq;
    
    if ((window as any).MercadoPago) {
      resolve(new (window as any).MercadoPago(publicKey));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    // Set crossorigin for better mobile compatibility (in-app browsers)
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      // Restore fbq if it was overwritten by the MP SDK
      if (existingFbq && !(window as any).fbq) {
        (window as any).fbq = existingFbq;
      }
      try {
        resolve(new (window as any).MercadoPago(publicKey));
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => {
      mpSdkPromise = null; // Allow retry on failure (common on slow mobile networks)
      reject(new Error('Failed to load MercadoPago SDK'));
    };
    document.body.appendChild(script);
  });
  return mpSdkPromise;
}

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planKey = searchParams.get('plan') || '';
  
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'pix'>('card');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState(false);
  const [countdown, setCountdown] = useState(15 * 60);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const mpRef = useRef<any>(null);

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardDocType, setCardDocType] = useState('CPF');
  const [cardDocNumber, setCardDocNumber] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [installments, setInstallments] = useState(1);
  const [availableInstallments, setAvailableInstallments] = useState<{value: number; label: string}[]>([]);

  // Initialize MercadoPago SDK + Load plan IN PARALLEL for <3s load
  useEffect(() => {
    if (!planKey) { setPlanLoading(false); setPlanError(true); return; }

    const loadPlanData = async () => {
      const { data, error } = await supabase
        .from('subscription_plans' as any)
        .select('*')
        .eq('plan_key', planKey)
        .eq('is_active', true)
        .single();
      if (error || !data) { setPlanError(true); return; }
      const p = data as any;
      setPlan({
        ...p,
        features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
      });
      trackPixelEvent('InitiateCheckout', { content_name: p.name, value: p.price, currency: 'BRL' }, user?.id);
    };

    const loadSdk = async () => {
      try {
        const res = await fetch(PUBLIC_KEY_URL, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.publicKey) mpRef.current = await loadMPSdk(data.publicKey);
      } catch (err) {
        console.error('[Checkout] Failed to init MercadoPago:', err);
      }
    };

    Promise.all([loadPlanData(), loadSdk()]).finally(() => setPlanLoading(false));
  }, [planKey]);

  // Set email from user
  useEffect(() => {
    if (user?.email) setCardEmail(user.email);
  }, [user]);

  // Fetch installments when card number has 6+ digits
  useEffect(() => {
    const bin = cardNumber.replace(/\s/g, '').slice(0, 6);
    if (bin.length < 6 || !mpRef.current || !plan) return;
    
    const fetchInstallments = async () => {
      try {
        const result = await mpRef.current.getInstallments({
          amount: String(plan.price),
          bin,
        });
        if (result?.[0]?.payer_costs) {
          setAvailableInstallments(
            result[0].payer_costs.map((c: any) => ({
              value: c.installments,
              label: c.recommended_message,
            }))
          );
        }
      } catch {}
    };
    fetchInstallments();
  }, [cardNumber, plan]);

  // Check payment return
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (!paymentStatus) return;
    if (paymentStatus === 'success') navigate('/obrigado', { replace: true });
    else if (paymentStatus === 'failure') toast.error('Pagamento não aprovado.');
    else if (paymentStatus === 'pending') toast.info('Pagamento pendente.');
  }, [searchParams]);

  // Countdown
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
        localStorage.setItem('checkout_plan_key', planKey);
        localStorage.setItem('checkout_plan_name', plan?.name || '');
        localStorage.setItem('checkout_plan_value', String(plan?.price || 0));
        localStorage.setItem('checkout_method', 'Pix');
        navigate('/obrigado');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [pixData, pollingPayment]);

  // Format card number with spaces
  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  // Format expiry MM/YY
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  // Format CPF
  const formatDoc = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 11);
  };

  // Handle Card Payment
  const handleCardSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !plan || !mpRef.current) return;
    setCardProcessing(true);
    setPaymentError(null);

    trackPixelEvent('AddPaymentInfo', {
      content_name: plan.name, content_category: 'Cartão', value: plan.price, currency: 'BRL',
    }, user.id);

    try {
      const [expMonth, expYear] = cardExpiry.split('/');
      const cardNumberClean = cardNumber.replace(/\s/g, '');

      // Create card token
      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: cardNumberClean,
        cardholderName: cardName,
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cardCvv,
        identificationType: cardDocType,
        identificationNumber: cardDocNumber,
      });

      if (!tokenResult?.id) throw new Error('Erro ao tokenizar cartão');

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
          plan: planKey,
          paymentMethod: 'card',
          cardToken: tokenResult.id,
          installments,
          payerEmail: cardEmail,
          identificationType: cardDocType,
          identificationNumber: cardDocNumber,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      
      if (data.status === 'approved') {
        setPaymentSuccess(true);
        localStorage.setItem('checkout_plan_key', planKey);
        localStorage.setItem('checkout_plan_name', plan.name);
        localStorage.setItem('checkout_plan_value', String(plan.price));
        localStorage.setItem('checkout_method', 'Cartão');
        toast.success('Pagamento aprovado!');
        setTimeout(() => navigate('/obrigado'), 2000);
      } else if (data.status === 'in_process' || data.status === 'pending') {
        toast.info('Pagamento em processamento.');
        setPaymentError('Pagamento em processamento. Aguarde a confirmação.');
      } else {
        const statusMessages: Record<string, string> = {
          'cc_rejected_bad_filled_card_number': 'Número do cartão incorreto.',
          'cc_rejected_bad_filled_date': 'Data de validade incorreta.',
          'cc_rejected_bad_filled_other': 'Dados do cartão incorretos.',
          'cc_rejected_bad_filled_security_code': 'Código de segurança incorreto.',
          'cc_rejected_blacklist': 'Cartão não autorizado.',
          'cc_rejected_call_for_authorize': 'Ligue para a operadora do cartão.',
          'cc_rejected_card_disabled': 'Cartão desabilitado.',
          'cc_rejected_duplicated_payment': 'Pagamento duplicado.',
          'cc_rejected_high_risk': 'Pagamento recusado por segurança.',
          'cc_rejected_insufficient_amount': 'Saldo insuficiente.',
          'cc_rejected_max_attempts': 'Limite de tentativas atingido.',
        };
        const msg = statusMessages[data.statusDetail] || 'Pagamento não aprovado. Tente outro método.';
        setPaymentError(msg);
        toast.error(msg);
      }
    } catch (err) {
      console.error('Card payment error:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao processar pagamento';
      setPaymentError(msg);
      toast.error(msg);
    } finally {
      setCardProcessing(false);
    }
  }, [user, plan, planKey, navigate, cardNumber, cardName, cardExpiry, cardCvv, cardDocType, cardDocNumber, cardEmail, installments]);

  // Handle Pix Payment
  const handlePixPay = async () => {
    if (!user || !plan) return;
    setLoading(true);
    setPaymentError(null);

    trackPixelEvent('AddPaymentInfo', {
      content_name: plan.name, content_category: 'Pix', value: plan.price, currency: 'BRL',
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
        body: JSON.stringify({ plan: planKey, paymentMethod: 'pix' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      setPixData({
        qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64,
        paymentId: data.paymentId, mpPaymentId: data.mpPaymentId, expiresAt: data.expiresAt,
      });
      setPollingPayment(true);
    } catch (err) {
      console.error('Pix error:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar Pix');
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

  // Loading state
  if (planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando checkout...</p>
        </div>
      </div>
    );
  }

  if (planError || !plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-foreground text-lg font-semibold">Plano não encontrado</p>
          <Button onClick={() => navigate('/')}>Escolher um Plano</Button>
        </div>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Pagamento Aprovado!</h2>
          <p className="text-muted-foreground">Redirecionando...</p>
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
        </motion.div>
      </div>
    );
  }

  const Icon = ICON_MAP[plan.icon] || Sparkles;
  // Use text-base (16px) to prevent iOS auto-zoom on focus
  const inputClass = "w-full rounded-xl border border-border bg-muted/50 px-4 py-3.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Checkout Seguro</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        {countdown > 0 && !pixData && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-muted-foreground">Oferta expira em</span>
            <span className="font-bold text-primary font-mono">{formatTime(countdown)}</span>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <AnimatePresence mode="wait">
              {pixData ? (
                <motion.div key="pix-payment" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="rounded-2xl border border-border bg-card p-6 space-y-5">
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
                        <textarea readOnly value={pixData.qrCode}
                          className="w-full h-20 text-xs bg-muted rounded-xl p-3 resize-none border border-border font-mono text-foreground" />
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
                <motion.div key="payment-methods" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  <h2 className="text-xl font-bold text-foreground">Escolha o método de pagamento</h2>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setSelectedMethod('card')}
                      className={`relative rounded-xl border-2 p-4 transition-all text-left ${
                        selectedMethod === 'card'
                          ? 'border-primary bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]'
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}>
                      <div className="flex items-center gap-3 mb-2">
                        <CreditCard className={`w-5 h-5 ${selectedMethod === 'card' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="font-semibold text-sm text-foreground">Cartão de Crédito</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Até 12x sem juros</p>
                      {selectedMethod === 'card' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button onClick={() => setSelectedMethod('pix')}
                      className={`relative rounded-xl border-2 p-4 transition-all text-left ${
                        selectedMethod === 'pix'
                          ? 'border-primary bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]'
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      }`}>
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

                  {paymentError && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{paymentError}</span>
                    </motion.div>
                  )}

                  {/* Card Payment - Custom Form */}
                  {selectedMethod === 'card' && (
                    <form onSubmit={handleCardSubmit} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Número do Cartão</label>
                        <input type="text" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000"
                          value={cardNumber} onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                          className={inputClass} required />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Nome no Cartão</label>
                        <input type="text" autoComplete="cc-name" placeholder="NOME COMO ESTÁ NO CARTÃO"
                          value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())}
                          className={inputClass} required />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Validade</label>
                          <input type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA"
                            value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                            className={inputClass} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">CVV</label>
                          <input type="text" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4}
                            value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            className={inputClass} required />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">CPF do Titular</label>
                        <input type="text" inputMode="numeric" autoComplete="off" placeholder="00000000000"
                          value={cardDocNumber} onChange={e => setCardDocNumber(formatDoc(e.target.value))}
                          className={inputClass} required />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">E-mail</label>
                        <input type="email" autoComplete="email" placeholder="seu@email.com"
                          value={cardEmail} onChange={e => setCardEmail(e.target.value)}
                          className={inputClass} required />
                      </div>

                      {availableInstallments.length > 1 && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Parcelas</label>
                          <select value={installments} onChange={e => setInstallments(Number(e.target.value))}
                            className={`${inputClass} bg-muted/50`}>
                            {availableInstallments.map(inst => (
                              <option key={inst.value} value={inst.value}>{inst.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <Button type="submit" disabled={cardProcessing}
                        className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] transition-all hover:shadow-[0_0_40px_-5px_hsl(var(--primary)/0.6)]">
                        {cardProcessing ? (
                          <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Processando...</>
                        ) : (
                          <><CreditCard className="w-5 h-5 mr-2" /> Pagar R$ {plan.price.toFixed(2).replace('.', ',')}</>
                        )}
                      </Button>
                    </form>
                  )}

                  {/* Pix Payment */}
                  {selectedMethod === 'pix' && (
                    <div className="space-y-4">
                      <Button onClick={handlePixPay} disabled={loading}
                        className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] transition-all hover:shadow-[0_0_40px_-5px_hsl(var(--primary)/0.6)]">
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <QrCode className="w-5 h-5 mr-2" />}
                        {loading ? 'Gerando Pix...' : `Pagar R$ ${plan.price.toFixed(2).replace('.', ',')} com Pix`}
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Shield className="w-4 h-4 text-primary" /> Pagamento 100% seguro
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary" /> Garantia de 7 dias
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Zap className="w-4 h-4 text-primary" /> Ativação instantânea
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

              <ul className="space-y-2 pb-4 border-b border-border">
                {plan.features.slice(0, 5).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

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
