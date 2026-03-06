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

async function fireCAPI(plan: { name: string; value: number; key: string }) {
  try {
    const { data: pixels } = await supabase
      .from('facebook_pixel_config')
      .select('pixel_id, access_token, dedup_key')
      .eq('is_active', true);

    if (!pixels?.length) return;

    const eventId = `${pixels[0].dedup_key || 'dedup'}_${Date.now()}`;

    for (const px of pixels) {
      await fetch(
        `https://graph.facebook.com/v21.0/${px.pixel_id}/events?access_token=${px.access_token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId,
              event_source_url: window.location.href,
              action_source: 'website',
              user_data: {
                client_user_agent: navigator.userAgent,
                client_ip_address: '',
              },
              custom_data: {
                content_name: plan.name,
                content_category: 'Plano',
                value: plan.value,
                currency: 'BRL',
                content_ids: [plan.key],
                content_type: 'product',
              },
            }],
          }),
        }
      );
    }
    console.log('[ThankYou] CAPI Purchase event sent for', plan.name);
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

  useEffect(() => {
    if (pixelFired.current) return;

    const planName = isTest ? 'Plano Pro' : (localStorage.getItem('checkout_plan_name') || '');
    const planValue = isTest ? 47.00 : parseFloat(localStorage.getItem('checkout_plan_value') || '0');
    const planKey = isTest ? 'pro' : (localStorage.getItem('checkout_plan_key') || '');
    const method = isTest ? 'Teste' : (localStorage.getItem('checkout_method') || 'Cartão/Boleto');

    const fireEvent = () => {
      pixelFired.current = true;
      console.log('[ThankYou] Disparando Purchase', { planName, planValue, planKey, method, isTest });

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
      fireCAPI({ name: planName, value: planValue, key: planKey });

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
            fireCAPI(p);
            console.log(`[ThankYou] Test Purchase fired: ${p.name} R$${p.value}`);
          }, (i + 1) * 1000);
        });
      }

      if (!isTest) {
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
  }, [user?.id, isTest]);

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
            {isTest
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
