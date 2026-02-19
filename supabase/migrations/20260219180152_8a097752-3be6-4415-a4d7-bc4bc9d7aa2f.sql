
-- Table to track signup attempts by IP and device fingerprint
CREATE TABLE public.signup_guards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT,
  email_domain TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast IP lookups
CREATE INDEX idx_signup_guards_ip ON public.signup_guards (ip_address, created_at);
-- Index for fingerprint lookups
CREATE INDEX idx_signup_guards_fingerprint ON public.signup_guards (device_fingerprint);

-- Enable RLS but allow edge function (service role) to manage
ALTER TABLE public.signup_guards ENABLE ROW LEVEL SECURITY;

-- No public access - only service role can read/write
-- RLS is enabled with no policies = no access from anon/authenticated
