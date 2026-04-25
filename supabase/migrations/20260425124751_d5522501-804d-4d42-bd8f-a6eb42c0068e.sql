-- 1. PAYMENTS: remove insert do usuário (apenas service_role/webhook insere)
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;

-- 2. USER_SUBSCRIPTIONS: remove update do usuário (evita auto-upgrade de plano)
DROP POLICY IF EXISTS "Users can update own subscription" ON public.user_subscriptions;

-- 3. VIDEO_USAGE: remove insert do usuário (evita fabricação de saldo)
DROP POLICY IF EXISTS "Users can insert own usage" ON public.video_usage;

-- 4. STORAGE: bloqueio explícito de UPDATE nos buckets videos e testimonials
CREATE POLICY "Block updates on videos bucket"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id != 'videos' AND bucket_id != 'testimonials');