
-- Table to track testimonial submissions
CREATE TABLE public.testimonial_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '6 months'),
  status TEXT NOT NULL DEFAULT 'active'
);

ALTER TABLE public.testimonial_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own submissions"
  ON public.testimonial_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions"
  ON public.testimonial_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
