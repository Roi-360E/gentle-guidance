import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Rocket, Sparkles, Zap, Crown, Star, Check, ArrowRight, ArrowLeft, Loader2, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserCurrency, type Currency } from '@/hooks/useUserCurrency';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface PlanData {
  id: string;
  plan_key: string;
  name: string;
  price: number;
  price_brl: number | null;
  price_usd: number | null;
  price_eur: number | null;
  tokens: number;
  features: string[];
  icon: string;
  color: string;
  bg_color: string;
  is_popular: boolean;
}

const ICON_MAP: Record<string, any> = { Sparkles, Zap, Crown };

const PlansPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, setCurrency, format } = useUserCurrency();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('subscription_plans' as any)
      .select('*')
      .eq('is_active', true)
      .gt('price', 0)
      .order('price', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setPlans((data as any[]).map((p: any) => ({
            ...p,
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
            price_brl: p.price_brl ?? p.price ?? 0,
            price_usd: p.price_usd ?? null,
            price_eur: p.price_eur ?? null,
          })));
        }
        setPlansLoading(false);
      });
  }, []);

  const getPriceFor = (plan: PlanData, c: Currency): number | null => {
    if (c === 'BRL') return plan.price_brl ?? plan.price ?? 0;
    if (c === 'USD') return plan.price_usd;
    if (c === 'EUR') return plan.price_eur;
    return null;
  };

  // Filter plans that have a price in the chosen currency
  const visiblePlans = plans.filter(p => {
    const price = getPriceFor(p, currency);
    return price != null && price > 0;
  });

  const handleSelect = async (plan: PlanData) => {
    if (currency === 'BRL') {
      navigate(`/cadastro/${plan.plan_key}`);
      return;
    }

    if (!user) {
      toast.error(t('plans.loginNeeded'));
      navigate('/auth?redirect=/planos');
      return;
    }

    setCheckoutLoading(`${plan.plan_key}-${currency}`);
    try {
      const price = getPriceFor(plan, currency) || 0;
      localStorage.setItem('checkout_plan_key', plan.plan_key);
      localStorage.setItem('checkout_plan_name', plan.name);
      localStorage.setItem('checkout_plan_value', String(price));
      localStorage.setItem('checkout_method', `Stripe ${currency}`);

      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { plan_key: plan.plan_key, currency },
      });

      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || t('plans.checkoutError'));
      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('plans.checkoutError');
      toast.error(message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="bg-primary/20 rounded-xl p-3">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">{t('plans.title')}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('plans.subtitle')}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-1.5">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('plans.currencyLabel')}</span>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">🇧🇷 Real (R$)</SelectItem>
                <SelectItem value="USD">🇺🇸 Dollar ($)</SelectItem>
                <SelectItem value="EUR">🇪🇺 Euro (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : visiblePlans.length === 0 ? (
          <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border border-border">
            <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-bold text-foreground mb-1">{t('plans.comingSoonTitle', { currency })}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('plans.comingSoonDesc')}
            </p>
            <Button variant="outline" size="sm" onClick={() => setCurrency('BRL')}>
              {t('plans.seeBRL')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePlans.map((plan) => {
              const Icon = ICON_MAP[plan.icon] || Sparkles;
              const price = getPriceFor(plan, currency)!;
              const isCheckingOut = checkoutLoading === `${plan.plan_key}-${currency}`;
              return (
                <Card
                  key={plan.id}
                  className="relative border-2 transition-all hover:scale-[1.02] border-border hover:border-primary/50"
                >
                  {plan.is_popular && (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-2">
                      <Star className="w-3 h-3 mr-1" /> {t('plans.popular')}
                    </Badge>
                  )}
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.bg_color}`}>
                        <Icon className={`w-5 h-5 ${plan.color}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{plan.name}</h3>
                        <p className="text-xs text-muted-foreground">{t('plans.tokens', { count: plan.tokens })}</p>
                      </div>
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      {format(price)}
                      <span className="text-xs text-muted-foreground font-normal">/{t('common.month')}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {(plan.features as string[]).slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={plan.is_popular ? 'default' : 'outline'}
                      disabled={isCheckingOut}
                      onClick={() => handleSelect(plan)}
                    >
                      {isCheckingOut ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {currency === 'BRL' ? t('plans.selectBRL') : t('plans.selectStripe', { currency })} <ArrowRight className="w-4 h-4 ml-1" />
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
            {t('common.alreadyHaveAccount')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlansPage;

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

          <div className="mt-4 inline-flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-1.5">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Moeda:</span>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">🇧🇷 Real (R$)</SelectItem>
                <SelectItem value="USD">🇺🇸 Dollar ($)</SelectItem>
                <SelectItem value="EUR">🇪🇺 Euro (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : visiblePlans.length === 0 ? (
          <div className="text-center py-12 px-6 bg-muted/30 rounded-xl border border-border">
            <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-bold text-foreground mb-1">Planos em {currency} em breve</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Ainda não temos preços configurados nesta moeda. Você pode escolher Real (R$) ou nos contatar.
            </p>
            <Button variant="outline" size="sm" onClick={() => setCurrency('BRL')}>
              Ver planos em Real
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePlans.map((plan) => {
              const Icon = ICON_MAP[plan.icon] || Sparkles;
              const price = getPriceFor(plan, currency)!;
              const isCheckingOut = checkoutLoading === `${plan.plan_key}-${currency}`;
              return (
                <Card
                  key={plan.id}
                  className="relative border-2 transition-all hover:scale-[1.02] border-border hover:border-primary/50"
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
                      {format(price)}
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
                    <Button
                      className="w-full"
                      variant={plan.is_popular ? 'default' : 'outline'}
                      disabled={isCheckingOut}
                      onClick={() => handleSelect(plan)}
                    >
                      {isCheckingOut ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {currency === 'BRL' ? 'Selecionar' : `Pagar com Stripe em ${currency}`} <ArrowRight className="w-4 h-4 ml-1" />
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
