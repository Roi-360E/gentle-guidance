
-- Table to store Instagram OAuth connections
CREATE TABLE public.instagram_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT,
  page_id TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connection"
ON public.instagram_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connection"
ON public.instagram_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connection"
ON public.instagram_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connection"
ON public.instagram_connections FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_instagram_connections_updated_at
BEFORE UPDATE ON public.instagram_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
