UPDATE public.subscription_plans SET price_eur = 19  WHERE plan_key = 'planointermediario';
UPDATE public.subscription_plans SET price_eur = 49  WHERE plan_key = 'professional';
UPDATE public.subscription_plans SET price_eur = 99  WHERE plan_key = '1200';
UPDATE public.subscription_plans SET price_eur = NULL WHERE plan_key IN ('premium','planoilimitadoprofissional');