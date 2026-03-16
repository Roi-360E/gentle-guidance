-- Update status check constraint to include 'pending_charge'
ALTER TABLE public.user_subscriptions DROP CONSTRAINT user_subscriptions_status_check;
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_status_check 
  CHECK (status IN ('trial', 'active', 'blocked', 'cancelled', 'pending_charge'));
