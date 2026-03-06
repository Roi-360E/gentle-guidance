
CREATE TABLE public.facebook_pixel_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_id text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_pixel_config ENABLE ROW LEVEL SECURITY;

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

-- Insert a default row
INSERT INTO public.facebook_pixel_config (pixel_id, access_token, is_active)
VALUES ('', '', false);
