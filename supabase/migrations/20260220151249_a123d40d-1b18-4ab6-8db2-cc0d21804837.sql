
-- Atualizar trigger para novos usuários com 15 tokens
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.video_usage (user_id, month_year, video_count, plan, token_balance)
  VALUES (
    NEW.id,
    to_char(now(), 'YYYY-MM'),
    0,
    'free',
    15
  );
  RETURN NEW;
END;
$$;

-- Atualizar default da coluna
ALTER TABLE public.video_usage ALTER COLUMN token_balance SET DEFAULT 15;

-- Atualizar usuários gratuitos existentes que ainda têm 10 tokens
UPDATE public.video_usage SET token_balance = 15 WHERE plan = 'free' AND token_balance = 10;
