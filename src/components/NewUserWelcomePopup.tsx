import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Lazy-load heavy dialog UI — only loaded when popup actually opens
const LazyDialogContent = lazy(() => import('./NewUserWelcomePopupContent'));

interface NewUserWelcomePopupProps {
  userId: string | undefined;
  currentPlan: string;
  tokenBalance: number;
}

export const NewUserWelcomePopup = ({ userId, currentPlan, tokenBalance }: NewUserWelcomePopupProps) => {
  const navigate = useNavigate();
  const { justLoggedIn, clearJustLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [suggestedPlanName, setSuggestedPlanName] = useState('');
  const [suggestedPlanPrice, setSuggestedPlanPrice] = useState(0);

  useEffect(() => {
    if (!userId || !justLoggedIn) return;

    // Use requestIdleCallback to defer DB query so it doesn't block video processing
    const scheduleQuery = (typeof window !== 'undefined' && 'requestIdleCallback' in window)
      ? window.requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000);

    const idleId = scheduleQuery(async () => {
      // Single optimized query — find the suggested plan in one pass
      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('name, price, plan_key')
        .eq('is_active', true)
        .gt('price', 0)
        .order('price', { ascending: true })
        .limit(10);

      if (!plans || plans.length === 0) return;

      let suggested = plans[0];

      if (currentPlan && currentPlan !== 'free') {
        const currentPlanData = plans.find(p => p.plan_key === currentPlan);
        if (currentPlanData) {
          const currentPrice = Number(currentPlanData.price);
          const nextPlan = plans.find(p => Number(p.price) > currentPrice);
          if (nextPlan) {
            suggested = nextPlan;
          } else {
            return;
          }
        }
      }

      setSuggestedPlanName(suggested.name);
      setSuggestedPlanPrice(Number(suggested.price));
      setTimeout(() => setOpen(true), 300);
    });

    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [userId, currentPlan, justLoggedIn]);

  const dismiss = () => {
    clearJustLoggedIn();
    setOpen(false);
  };

  const handleGoToPlans = () => {
    dismiss();
    navigate('/plans');
  };

  if (!suggestedPlanName) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md border-primary/30 shadow-[0_0_40px_rgba(var(--primary),0.15)]">
        <DialogHeader>
          <div className="flex justify-center mb-3">
            <div className="relative">
              <div className="rounded-full bg-gradient-to-br from-primary to-primary/60 p-5 shadow-lg">
                <Flame className="h-10 w-10 text-primary-foreground animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                UPGRADE
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-2xl font-bold">
            {currentPlan === 'free' ? '🚀 Comece a Criar Agora!' : '⚡ Faça Upgrade!'}
          </DialogTitle>
          <DialogDescription className="text-center text-base mt-3 space-y-2">
            <span className="block">
              {currentPlan === 'free'
                ? 'Recarregue seus tokens e desbloqueie o poder de criar vídeos combinados ilimitados!'
                : 'Desbloqueie ainda mais recursos com um plano superior!'}
            </span>
            <span className="block mt-3 text-lg font-semibold text-foreground">
              {currentPlan === 'free' ? 'A partir de apenas ' : 'Upgrade por '}
              <span className="text-primary text-xl font-bold">
                R$ {suggestedPlanPrice.toFixed(2).replace('.', ',')}
              </span>
            </span>
            <span className="block text-sm text-muted-foreground">
              Plano {suggestedPlanName} • Acesso imediato
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-5">
          <Button onClick={handleGoToPlans} size="lg" className="w-full gap-2 text-base font-semibold shadow-md">
            <Zap className="h-5 w-5" />
            {currentPlan === 'free' ? 'Ver Planos e Recarregar' : 'Fazer Upgrade'}
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button variant="ghost" onClick={dismiss} className="w-full text-muted-foreground text-sm">
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
