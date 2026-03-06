
-- Drop the restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admins can delete pixel config" ON public.facebook_pixel_config;
DROP POLICY IF EXISTS "Admins can insert pixel config" ON public.facebook_pixel_config;
DROP POLICY IF EXISTS "Admins can update pixel config" ON public.facebook_pixel_config;
DROP POLICY IF EXISTS "Admins can view pixel config" ON public.facebook_pixel_config;

-- Recreate as permissive policies
CREATE POLICY "Admins can view pixel config"
  ON public.facebook_pixel_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert pixel config"
  ON public.facebook_pixel_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pixel config"
  ON public.facebook_pixel_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete pixel config"
  ON public.facebook_pixel_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
