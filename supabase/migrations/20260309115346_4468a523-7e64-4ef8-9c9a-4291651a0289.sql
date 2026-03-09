
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS has_voice_rewrite boolean NOT NULL DEFAULT false;

-- Enable voice rewrite for unlimited plan
UPDATE public.subscription_plans SET has_voice_rewrite = true WHERE plan_key = 'unlimited';
