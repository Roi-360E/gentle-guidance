
-- Table to store dynamic subscription plans
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_key text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  tokens integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  icon text NOT NULL DEFAULT 'Sparkles',
  color text NOT NULL DEFAULT 'text-muted-foreground',
  bg_color text NOT NULL DEFAULT 'bg-muted/50',
  is_popular boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Everyone can read active plans (public display)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

-- Only admin can insert/update/delete (via service role in edge function)
-- We'll handle admin writes through an edge function with service role

-- Seed current plans
INSERT INTO public.subscription_plans (plan_key, name, price, tokens, features, icon, color, bg_color, is_popular, sort_order) VALUES
  ('free', 'Gratuito', 0, 15, '["15 tokens iniciais","Processamento local","Suporte básico"]', 'Sparkles', 'text-muted-foreground', 'bg-muted/50', false, 0),
  ('professional', 'Profissional', 37.90, 200, '["200 tokens/mês","Processamento local","Suporte prioritário"]', 'Zap', 'text-primary', 'bg-primary/10', true, 1),
  ('advanced', 'Avançado', 67.90, 400, '["400 tokens/mês","Processamento local","Suporte prioritário","Legendas com IA"]', 'Zap', 'text-primary', 'bg-primary/10', false, 2),
  ('premium', 'Premium', 87.90, 850, '["850 tokens/mês","Processamento em nuvem","Suporte prioritário","Legendas com IA"]', 'Crown', 'text-accent', 'bg-accent/10', false, 3),
  ('enterprise', 'Empresarial', 197, 1200, '["1200 tokens/mês","Processamento em nuvem","Chat gerador de roteiros","Suporte VIP"]', 'Crown', 'text-accent', 'bg-accent/10', false, 4),
  ('unlimited', 'Ilimitado', 297, 999999, '["Tokens ilimitados","Processamento em nuvem","Chat gerador de roteiros","API dedicada","Suporte VIP"]', 'Crown', 'text-accent', 'bg-accent/10', false, 5);

-- Trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
