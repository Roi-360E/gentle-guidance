
-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. Update existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- 3. Update handle_new_user function to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

-- 4. Add has_ai_chat column to subscription_plans
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS has_ai_chat boolean NOT NULL DEFAULT false;

-- 5. Admin can SELECT all plans (including inactive)
CREATE POLICY "Admins can view all plans"
ON public.subscription_plans
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Admin can SELECT all profiles (for user management)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. Admin can UPDATE any profile (for access management)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 8. Admin can SELECT all video_usage (for user management)
CREATE POLICY "Admins can view all usage"
ON public.video_usage
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 9. Admin can UPDATE any video_usage (for plan management)
CREATE POLICY "Admins can update all usage"
ON public.video_usage
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 10. Admin can INSERT video_usage for any user
CREATE POLICY "Admins can insert usage"
ON public.video_usage
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
