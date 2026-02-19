
-- Add cpf_hash column to profiles (unique, to prevent duplicate CPFs)
ALTER TABLE public.profiles ADD COLUMN cpf_hash text UNIQUE;

-- Create index for fast lookups
CREATE INDEX idx_profiles_cpf_hash ON public.profiles (cpf_hash);
