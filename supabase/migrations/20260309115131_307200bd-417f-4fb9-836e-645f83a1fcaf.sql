
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tokens integer;
BEGIN
  -- Read token balance from admin-configured free plan
  SELECT tokens INTO _tokens
  FROM public.subscription_plans
  WHERE plan_key = 'free' AND is_active = true
  LIMIT 1;

  -- Fallback to 0 if no free plan found
  IF _tokens IS NULL THEN
    _tokens := 0;
  END IF;

  INSERT INTO public.video_usage (user_id, month_year, video_count, plan, token_balance)
  VALUES (
    NEW.id,
    to_char(now(), 'YYYY-MM'),
    0,
    'free',
    _tokens
  );
  RETURN NEW;
END;
$function$;
