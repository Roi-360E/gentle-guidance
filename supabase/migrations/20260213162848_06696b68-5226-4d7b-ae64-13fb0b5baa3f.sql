-- Create trigger to auto-create free video_usage for new users (first month only)
CREATE OR REPLACE FUNCTION public.handle_new_user_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.video_usage (user_id, month_year, plan, video_count)
  VALUES (NEW.id, to_char(now(), 'YYYY-MM'), 'free', 0);
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created_usage
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_usage();