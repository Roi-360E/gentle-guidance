import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Rocket, Sparkles, Zap, Crown, Star, Check, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

const PlansPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('subscription_plans' as any)
      .select('*')
      .eq('is_active', true)
      .gt('price', 0)
      .order('price', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setPlans(data.map((p: any) => ({
            ...p,
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
          })));
        }
        setPlansLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="bg-primary/20 rounded-xl p-3">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Escolha seu plano</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Selecione o plano ideal e comece agora
          </p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const Icon = ICON_MAP[plan.icon] || Sparkles;
              return (
                <Card
                  key={plan.id}
                  className="relative cursor-pointer border-2 transition-all hover:scale-[1.02] border-border hover:border-primary/50"
                  onClick={() => navigate(`/cadastro/${plan.plan_key}`)}
                >
                  {plan.is_popular && (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-2">
                      <Star className="w-3 h-3 mr-1" /> Popular
                    </Badge>
                  )}
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.bg_color}`}>
                        <Icon className={`w-5 h-5 ${plan.color}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground">{plan.tokens} tokens</p>
                      </div>
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      R$ {plan.price.toFixed(2).replace('.', ',')}
                      <span className="text-xs text-muted-foreground font-normal">/mês</span>
                    </div>
                    <ul className="space-y-1.5">
                      {(plan.features as string[]).slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" variant={plan.is_popular ? 'default' : 'outline'}>
                      Selecionar <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-3 h-3 inline mr-1" />
            Já tem conta? Entre
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlansPage;
