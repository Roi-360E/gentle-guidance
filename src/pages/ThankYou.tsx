import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home, Sparkles, Crown, Zap } from 'lucide-react';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

const TEST_PLANS = [
  { name: 'Plano Starter', value: 27.00, key: 'starter' },
  { name: 'Plano Pro', value: 47.00, key: 'pro' },
  { name: 'Plano Premium', value: 97.00, key: 'premium' },
];

const ICON_MAP: Record<string, any> = { Sparkles, Zap, Crown };

async function fireCAPI(plan: { name: string; value: number; key: string }, userId?: string) {
  try {
    const { data, error } = await supabase.functions.invoke('fire-purchase-event', {
      body: {
        plan_name: plan.name,
        plan_value: plan.value,
        plan_key: plan.key,
        user_id: userId || null,
        event_source_url: window.location.href,
      },
    });
    if (error) console.warn('[ThankYou] CAPI edge function error:', error);
    else console.log('[ThankYou] CAPI Purchase sent via server for', plan.name, data);
  } catch (e) {
    console.warn('[ThankYou] CAPI error:', e);
  }
}

export default function ThankYou() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const pixelFired = useRef(false);

  const isTest = searchParams.get('test') === '1';
  const isReal = searchParams.get('real') === '1';

  const [purchasedPlan, setPurchasedPlan] = useState<{
    name: string; key: string; value: number; method: string; icon?: string; color?: string;
  } | null>(null);

  // Load plan info
  useEffect(() => {
    const planKey = localStorage.getItem('checkout_plan_key') || '';
    const planName = localStorage.getItem('checkout_plan_name') || '';
    const planValue = parseFloat(localStorage.getItem('checkout_plan_value') || '0');
    const method = localStorage.getItem('checkout_method') || 'Cartão';

    if (planKey) {
      // Fetch icon/color from DB
      supabase
        .from('subscription_plans' as any)
        .select('icon, color, name')
        .eq('plan_key', planKey)
        .single()
        .then(({ data }) => {
          const d = data as any;
          setPurchasedPlan({
            name: d?.name || planName,
            key: planKey,
            value: planValue,
            method,
            icon: d?.icon,
            color: d?.color,
          });
        });
    } else if (!isTest && !isReal) {
      setPurchasedPlan({ name: 'Seu Plano', key: '', value: 0, method });
    }
  }, [isTest, isReal]);

  // Fire pixel events
  useEffect(() => {
    if (pixelFired.current) return;

    let planName: string;
    let planValue: number;
    let planKey: string;
    let method: string;

    if (isReal) {
      planName = 'Plano Starter';
      planValue = 38.00;
      planKey = 'starter';
      method = 'Cartão/Boleto';
    } else if (isTest) {
      planName = 'Plano Pro';
      planValue = 47.00;
      planKey = 'pro';
      method = 'Teste';
    } else {
      planName = localStorage.getItem('checkout_plan_name') || '';
      planValue = parseFloat(localStorage.getItem('checkout_plan_value') || '0');
      planKey = localStorage.getItem('checkout_plan_key') || '';
      method = localStorage.getItem('checkout_method') || 'Cartão/Boleto';
    }

    const fireEvent = () => {
      pixelFired.current = true;
      trackPixelEvent('Purchase', {
        content_name: planName, content_category: method,
        value: planValue, currency: 'BRL', content_ids: [planKey], content_type: 'product',
      }, user?.id);

      fireCAPI({ name: planName, value: planValue, key: planKey }, user?.id);

      if (isTest) {
        TEST_PLANS.forEach((p, i) => {
          setTimeout(() => {
            trackPixelEvent('Purchase', {
              content_name: p.name, content_category: 'Teste',
              value: p.value, currency: 'BRL', content_ids: [p.key], content_type: 'product',
            }, user?.id);
            fireCAPI(p, user?.id);
          }, (i + 1) * 1000);
        });
      }

      if (!isTest && !isReal) {
        localStorage.removeItem('checkout_plan_name');
        localStorage.removeItem('checkout_plan_value');
        localStorage.removeItem('checkout_plan_key');
        localStorage.removeItem('checkout_method');
      }
    };

    if (typeof window !== 'undefined' && (window as any).fbq) {
      fireEvent();
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if ((window as any).fbq || attempts >= 20) {
          clearInterval(interval);
          fireEvent();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [user?.id, isTest, isReal]);

  const PlanIcon = purchasedPlan?.icon ? (ICON_MAP[purchasedPlan.icon] || Sparkles) : Sparkles;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-md w-full text-center space-y-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center"
        >
          <CheckCircle2 className="w-14 h-14 text-primary" />
        </motion.div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">
            Pagamento Confirmado! 🎉
          </h1>
          <p className="text-muted-foreground text-lg">
            Obrigado pela sua compra! Seu plano já está ativo.
          </p>
        </div>

        {/* Purchased plan card */}
        {purchasedPlan && !isTest && !isReal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-4"
          >
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <PlanIcon className="w-6 h-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold text-foreground">{purchasedPlan.name}</p>
                <p className="text-sm text-muted-foreground">
                  R$ {purchasedPlan.value.toFixed(2).replace('.', ',')} / mês
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-primary font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Plano ativado com sucesso</span>
            </div>
          </motion.div>
        )}

        {(isTest || isReal) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-muted/50 rounded-xl p-6 space-y-3"
          >
            <Sparkles className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              {isReal
                ? '✅ Evento Purchase REAL disparado: Plano Pro R$47,00 via Browser + CAPI.'
                : 'Modo teste: eventos Purchase disparados para todos os planos via Browser + CAPI.'}
            </p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            size="lg"
            onClick={() => navigate('/')}
            className="w-full gap-2 text-lg py-6"
          >
            <Home className="w-5 h-5" />
            Acessar o Aplicativo
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
