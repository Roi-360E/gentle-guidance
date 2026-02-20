
-- Fix the trigger to give 10 tokens instead of 50 for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.video_usage (user_id, month_year, plan, video_count, token_balance)
  VALUES (NEW.id, to_char(now(), 'YYYY-MM'), 'free', 0, 10);
  RETURN NEW;
END;
$function$;

-- Also update the default value for token_balance column
ALTER TABLE public.video_usage ALTER COLUMN token_balance SET DEFAULT 10;
