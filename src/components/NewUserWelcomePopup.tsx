import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight } from 'lucide-react';
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
    if (!userId || currentPlan !== 'free') return;

    // Check if popup was already dismissed this session
    const dismissed = sessionStorage.getItem(`welcome_popup_${userId}`);
    if (dismissed) return;

    // Show popup for free plan users with 0 tokens
    if (tokenBalance === 0) {
      setOpen(true);
    }

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
  }, [userId, currentPlan, tokenBalance]);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Bem-vindo ao EscalaX Pro! 🚀
          </DialogTitle>
          <DialogDescription className="text-center text-base mt-2">
            Para começar a criar seus vídeos, faça sua primeira recarga de tokens.
            {lowestPlanName && (
              <span className="block mt-2 font-medium text-foreground">
                Planos a partir de <strong className="text-primary">R$ {lowestPlanPrice.toFixed(2).replace('.', ',')}</strong> ({lowestPlanName})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button onClick={handleGoToPlans} className="w-full gap-2">
            Ver Planos <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={handleDismiss} className="w-full text-muted-foreground">
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
