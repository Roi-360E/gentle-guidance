import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Zap, CheckCircle2 } from 'lucide-react';

type FeatureKey = 'has_ai_chat' | 'has_auto_subtitles' | 'has_voice_rewrite' | 'has_shorts_reels';

interface FeatureUpsellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureKey: FeatureKey;
  featureName: string;
}

interface PlanInfo {
  name: string;
  plan_key: string;
  price: number;
}

export function FeatureUpsellDialog({ open, onOpenChange, featureKey, featureName }: FeatureUpsellDialogProps) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('subscription_plans')
      .select('name, plan_key, price')
      .eq('is_active', true)
      .eq(featureKey, true)
      .order('price', { ascending: true })
      .then(({ data }) => {
        setPlans((data as PlanInfo[]) || []);
        setLoading(false);
      });
  }, [open, featureKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-muted-foreground" />
            {featureName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Esta funcionalidade não está disponível no seu plano atual. Ela está incluída nos seguintes planos:
          </p>

          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum plano ativo possui esta funcionalidade no momento.
            </p>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => (
                <div
                  key={plan.plan_key}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="font-medium text-foreground">{plan.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {plan.price === 0 ? 'Grátis' : `R$ ${plan.price.toFixed(2).replace('.', ',')}`}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold"
            onClick={() => {
              onOpenChange(false);
              navigate('/plans');
            }}
          >
            <Zap className="w-4 h-4 mr-2" />
            Ver Planos e Fazer Upgrade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
