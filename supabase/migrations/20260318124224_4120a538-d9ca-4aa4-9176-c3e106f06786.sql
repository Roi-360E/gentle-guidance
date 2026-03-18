
CREATE TABLE public.video_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  api_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  last_error text,
  last_used_at timestamptz,
  fail_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all video api keys"
  ON public.video_api_keys FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert video api keys"
  ON public.video_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update video api keys"
  ON public.video_api_keys FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete video api keys"
  ON public.video_api_keys FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_video_api_keys_updated_at
  BEFORE UPDATE ON public.video_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
