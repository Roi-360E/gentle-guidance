import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Flame } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface NewUserWelcomePopupProps {
  userId: string | undefined;
  currentPlan: string;
  tokenBalance: number;
}

export const NewUserWelcomePopup = ({ userId, currentPlan, tokenBalance }: NewUserWelcomePopupProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lowestPlanName, setLowestPlanName] = useState('');
  const [lowestPlanPrice, setLowestPlanPrice] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Check if popup was already dismissed in this session
    const dismissed = sessionStorage.getItem(`welcome_popup_${userId}`);
    if (dismissed) return;

    // Fetch lowest paid plan
    const fetchLowestPlan = async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('name, price')
        .eq('is_active', true)
        .gt('price', 0)
        .order('price', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) {
        setLowestPlanName(data.name);
        setLowestPlanPrice(Number(data.price));
      }
    };
    fetchLowestPlan();

    // Show popup after a short delay so page renders first
    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [userId]);

  const handleGoToPlans = () => {
    sessionStorage.setItem(`welcome_popup_${userId}`, 'true');
    setOpen(false);
    navigate('/plans');
  };

  const handleDismiss = () => {
    sessionStorage.setItem(`welcome_popup_${userId}`, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md border-primary/30 shadow-[0_0_40px_rgba(var(--primary),0.15)]">
        <DialogHeader>
          <div className="flex justify-center mb-3">
            <div className="relative">
              <div className="rounded-full bg-gradient-to-br from-primary to-primary/60 p-5 shadow-lg">
                <Flame className="h-10 w-10 text-primary-foreground animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                OFERTA
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-2xl font-bold">
            🚀 Comece a Criar Agora!
          </DialogTitle>
          <DialogDescription className="text-center text-base mt-3 space-y-2">
            <span className="block">
              Recarregue seus tokens e desbloqueie o poder de criar vídeos combinados ilimitados!
            </span>
            {lowestPlanName && (
              <span className="block mt-3 text-lg font-semibold text-foreground">
                A partir de apenas{' '}
                <span className="text-primary text-xl font-bold">
                  R$ {lowestPlanPrice.toFixed(2).replace('.', ',')}
                </span>
              </span>
            )}
            {lowestPlanName && (
              <span className="block text-sm text-muted-foreground">
                Plano {lowestPlanName} • Acesso imediato
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-5">
          <Button onClick={handleGoToPlans} size="lg" className="w-full gap-2 text-base font-semibold shadow-md">
            <Zap className="h-5 w-5" />
            Ver Planos e Recarregar
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button variant="ghost" onClick={handleDismiss} className="w-full text-muted-foreground text-sm">
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
