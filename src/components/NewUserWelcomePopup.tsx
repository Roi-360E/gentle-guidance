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

  if (!suggestedPlanName || !open) return null;

  return (
    <Suspense fallback={null}>
      <LazyDialogContent
        open={open}
        onDismiss={dismiss}
        onGoToPlans={handleGoToPlans}
        currentPlan={currentPlan}
        suggestedPlanName={suggestedPlanName}
        suggestedPlanPrice={suggestedPlanPrice}
      />
    </Suspense>
  );
};
