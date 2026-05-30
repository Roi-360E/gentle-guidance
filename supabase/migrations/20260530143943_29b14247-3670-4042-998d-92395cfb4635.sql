
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_brl numeric,
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS price_eur numeric;

-- Backfill BRL from existing price column (non-destructive)
UPDATE public.subscription_plans
SET price_brl = price
WHERE price_brl IS NULL;
