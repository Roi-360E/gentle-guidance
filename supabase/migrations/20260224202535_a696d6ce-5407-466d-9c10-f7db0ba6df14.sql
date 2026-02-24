
-- Add is_blocked column to profiles for admin to block/unblock users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
