
-- Track monthly video usage per user
CREATE TABLE public.video_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_year TEXT NOT NULL, -- format: '2026-02'
  video_count INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_year)
);

ALTER TABLE public.video_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.video_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON public.video_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON public.video_usage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_video_usage_updated_at
  BEFORE UPDATE ON public.video_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
