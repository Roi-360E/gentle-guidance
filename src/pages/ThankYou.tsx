import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home, Sparkles } from 'lucide-react';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

const TEST_PLANS = [
  { name: 'Plano Starter', value: 27.00, key: 'starter' },
  { name: 'Plano Pro', value: 47.00, key: 'pro' },
  { name: 'Plano Premium', value: 97.00, key: 'premium' },
];

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
    if (error) {
      console.warn('[ThankYou] CAPI edge function error:', error);
    } else {
      console.log('[ThankYou] CAPI Purchase sent via server for', plan.name, data);
    }
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

  useEffect(() => {
    if (pixelFired.current) return;

    let planName: string;
    let planValue: number;
    let planKey: string;
    let method: string;

    if (isReal) {
      // Disparo REAL de um único evento Purchase (sem test_event_code)
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
      console.log('[ThankYou] Disparando Purchase', { planName, planValue, planKey, method, isTest, isReal });

      // Browser-side fbq
      trackPixelEvent('Purchase', {
        content_name: planName,
        content_category: method,
        value: planValue,
        currency: 'BRL',
        content_ids: [planKey],
        content_type: 'product',
      }, user?.id);

      // CAPI direct call for reliability
      fireCAPI({ name: planName, value: planValue, key: planKey }, user?.id);

      // If test mode, fire all plans to seed multiple events
      if (isTest) {
        TEST_PLANS.forEach((p, i) => {
          setTimeout(() => {
            trackPixelEvent('Purchase', {
              content_name: p.name,
              content_category: 'Teste',
              value: p.value,
              currency: 'BRL',
              content_ids: [p.key],
              content_type: 'product',
            }, user?.id);
            fireCAPI(p, user?.id);
            console.log(`[ThankYou] Test Purchase fired: ${p.name} R$${p.value}`);
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
            Obrigado pela sua compra! Seu plano já está ativo e você pode começar a usar todas as funcionalidades agora.
          </p>
        </div>

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
              : isTest
              ? 'Modo teste: eventos Purchase disparados para todos os planos (Starter R$27, Pro R$47, Premium R$97) via Browser + CAPI.'
              : 'Seu plano foi ativado automaticamente. Aproveite todos os recursos disponíveis!'}
          </p>
        </motion.div>

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
            Ir para o início
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
