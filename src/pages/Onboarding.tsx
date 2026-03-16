import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, Check, Loader2, Shield, Lock, CreditCard,
  Sparkles, Crown, Zap, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const SAVE_CARD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-card`;
const PUBLIC_KEY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-public-key`;

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

let mpSdkPromise: Promise<any> | null = null;
function loadMPSdk(publicKey: string): Promise<any> {
  if (mpSdkPromise) return mpSdkPromise;
  mpSdkPromise = new Promise((resolve, reject) => {
    const existingFbq = (window as any).fbq;
    if ((window as any).MercadoPago) {
      resolve(new (window as any).MercadoPago(publicKey));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (existingFbq && !(window as any).fbq) {
        (window as any).fbq = existingFbq;
      }
      try { resolve(new (window as any).MercadoPago(publicKey)); }
      catch (e) { reject(e); }
    };
    script.onerror = () => {
      mpSdkPromise = null;
      reject(new Error('Failed to load payment SDK'));
    };
    document.body.appendChild(script);
  });
  return mpSdkPromise;
}

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const mpRef = useRef<any>(null);

  // Get plan from navigation state (passed from Auth page)
  const selectedPlan: PlanData | null = (location.state as any)?.selectedPlan || null;

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardDocType] = useState('CPF');
  const [cardDocNumber, setCardDocNumber] = useState('');
  const [cardEmail, setCardEmail] = useState('');

  // If no plan selected, redirect back to auth
  useEffect(() => {
    if (!selectedPlan) {
      navigate('/auth', { replace: true });
    }
  }, [selectedPlan, navigate]);

  // Load MP SDK
  useEffect(() => {
    const loadSdk = async () => {
      try {
        const res = await fetch(PUBLIC_KEY_URL, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.publicKey) {
          mpRef.current = await loadMPSdk(data.publicKey);
          setSdkReady(true);
        }
      } catch (err) {
        console.error('[Onboarding] Failed to init payment SDK:', err);
      }
    };
    loadSdk();
  }, []);

  useEffect(() => {
    if (user?.email) setCardEmail(user.email);
  }, [user]);

  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };
  const formatDoc = (v: string) => v.replace(/\D/g, '').slice(0, 11);

  const handleCardSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPlan || !mpRef.current) return;
    setProcessing(true);
    setPaymentError(null);

    try {
      const [expMonth, expYear] = cardExpiry.split('/');
      const cardNumberClean = cardNumber.replace(/\s/g, '');

      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: cardNumberClean,
        cardholderName: cardName,
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cardCvv,
        identificationType: cardDocType,
        identificationNumber: cardDocNumber,
      });

      if (!tokenResult?.id) throw new Error('Erro ao validar cartão');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await fetch(SAVE_CARD_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          cardToken: tokenResult.id,
          selectedPlan: selectedPlan.plan_key,
          payerEmail: cardEmail,
          identificationType: cardDocType,
          identificationNumber: cardDocNumber,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      toast.success('Cartão salvo! Seu plano foi ativado 🎉');
      navigate('/', { replace: true });

    } catch (err) {
      console.error('Card save error:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao salvar cartão';
      setPaymentError(msg);
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }, [user, selectedPlan, cardNumber, cardName, cardExpiry, cardCvv, cardDocType, cardDocNumber, cardEmail, navigate]);

  const inputClass = "w-full rounded-xl border border-border bg-muted/50 px-4 py-3.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none";

  if (!selectedPlan) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <CreditCard className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Pagamento seguro</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Card form */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Dados do Cartão</h2>
              </div>

              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-sm text-primary font-medium">
                  💳 A cobrança de R$ {selectedPlan.price.toFixed(2).replace('.', ',')} será feita após seu primeiro uso
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Depois, R$ {selectedPlan.price.toFixed(2).replace('.', ',')} /mês cobrado automaticamente
                </p>
              </div>

              {paymentError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{paymentError}</p>
                </div>
              )}

              <form onSubmit={handleCardSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Número do cartão</label>
                  <input
                    type="text" inputMode="numeric" placeholder="0000 0000 0000 0000"
                    value={cardNumber} onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                    className={inputClass} required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome no cartão</label>
                  <input
                    type="text" placeholder="Como está no cartão"
                    value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())}
                    className={inputClass} required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Validade</label>
                    <input
                      type="text" inputMode="numeric" placeholder="MM/AA"
                      value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                      className={inputClass} required maxLength={5}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CVV</label>
                    <input
                      type="text" inputMode="numeric" placeholder="000"
                      value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className={inputClass} required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CPF do titular</label>
                  <input
                    type="text" inputMode="numeric" placeholder="00000000000"
                    value={cardDocNumber} onChange={e => setCardDocNumber(formatDoc(e.target.value))}
                    className={inputClass} required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
                  <input
                    type="email" placeholder="seu@email.com"
                    value={cardEmail} onChange={e => setCardEmail(e.target.value)}
                    className={inputClass} required
                  />
                </div>

                <Button
                  type="submit" disabled={processing || !sdkReady}
                  className="w-full h-12 text-base font-bold bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl"
                >
                  {processing ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Salvando cartão...</>
                  ) : (
                    <><Lock className="w-4 h-4 mr-2" /> Salvar Cartão e Ativar Plano</>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Shield className="w-3.5 h-3.5" />
                  Seus dados estão protegidos com criptografia
                </div>
              </form>
            </div>
          </div>

          {/* Plan summary sidebar */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 sticky top-20">
              <h3 className="font-bold text-foreground">Resumo do Plano</h3>
              <div className="flex items-center gap-3">
                {(() => { const Icon = ICON_MAP[selectedPlan.icon] || Sparkles; return (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedPlan.bg_color}`}>
                    <Icon className={`w-5 h-5 ${selectedPlan.color}`} />
                  </div>
                ); })()}
                <div>
                  <p className="font-bold text-foreground">{selectedPlan.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedPlan.tokens} tokens/mês</p>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor mensal</span>
                  <span className="font-bold text-foreground">R$ {selectedPlan.price.toFixed(2).replace('.', ',')}/mês</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Primeira cobrança</span>
                  <span className="font-bold text-primary">Após o 1º uso</span>
                </div>
              </div>

              <div className="rounded-xl bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">
                  ✅ Acesso total ao plano <strong className="text-foreground">{selectedPlan.name}</strong>.
                  A cobrança de R$ {selectedPlan.price.toFixed(2).replace('.', ',')} será feita após seu primeiro uso, depois recorrente mensalmente.
                </p>
              </div>

              <ul className="space-y-1.5">
                {(selectedPlan.features as string[]).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
