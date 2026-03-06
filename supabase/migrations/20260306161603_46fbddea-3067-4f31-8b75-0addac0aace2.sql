
-- UTM tracking table
CREATE TABLE public.utm_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_page text,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.utm_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own UTM" ON public.utm_tracking FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own UTM" ON public.utm_tracking FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all UTM" ON public.utm_tracking FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Pixel events log table
CREATE TABLE public.pixel_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_source text NOT NULL DEFAULT 'browser',
  user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pixel_events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all pixel events" ON public.pixel_events_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert pixel events" ON public.pixel_events_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon can insert pixel events" ON public.pixel_events_log FOR INSERT TO anon WITH CHECK (true);

-- Index for funnel queries
CREATE INDEX idx_pixel_events_created ON public.pixel_events_log(created_at DESC);
CREATE INDEX idx_pixel_events_name ON public.pixel_events_log(event_name);
