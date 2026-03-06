import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home, Sparkles } from 'lucide-react';
import { trackPixelEvent } from '@/lib/pixel-tracker';
import { motion } from 'framer-motion';

export default function ThankYou() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pixelFired = useRef(false);

  useEffect(() => {
    if (pixelFired.current) return;
    pixelFired.current = true;

    const planName = localStorage.getItem('checkout_plan_name') || '';
    const planValue = parseFloat(localStorage.getItem('checkout_plan_value') || '0');
    const planKey = localStorage.getItem('checkout_plan_key') || '';
    const method = localStorage.getItem('checkout_method') || 'Cartão/Boleto';

    trackPixelEvent('Purchase', {
      content_name: planName,
      content_category: method,
      value: planValue,
      currency: 'BRL',
      content_ids: [planKey],
      content_type: 'product',
    }, user?.id);

    // Clean up
    localStorage.removeItem('checkout_plan_name');
    localStorage.removeItem('checkout_plan_value');
    localStorage.removeItem('checkout_plan_key');
    localStorage.removeItem('checkout_method');
  }, [user?.id]);

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
            Seu plano foi ativado automaticamente. Aproveite todos os recursos disponíveis!
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
