
-- Add token_balance column to video_usage
ALTER TABLE public.video_usage ADD COLUMN IF NOT EXISTS token_balance integer NOT NULL DEFAULT 50;

-- Update existing rows to have 50 tokens for free plan
UPDATE public.video_usage SET token_balance = 50 WHERE plan = 'free' AND token_balance = 0;

-- Update the trigger function to give 50 tokens to new users
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.video_usage (user_id, month_year, plan, video_count, token_balance)
  VALUES (NEW.id, to_char(now(), 'YYYY-MM'), 'free', 0, 50);
  RETURN NEW;
END;
$function$;
