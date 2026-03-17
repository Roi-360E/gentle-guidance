
-- Remove the policy that allows users to update their own usage (prevents usage manipulation)
DROP POLICY IF EXISTS "Users can update own usage" ON public.video_usage;

-- Remove the policy that allows users to update their own payments (prevents payment fraud)
DROP POLICY IF EXISTS "Users can update own payments" ON public.payments;
