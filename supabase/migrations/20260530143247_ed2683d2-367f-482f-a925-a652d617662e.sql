
-- 1) Tighten always-true INSERT policies on pixel_events_log with input validation
DROP POLICY IF EXISTS "Anyone can insert pixel events" ON public.pixel_events_log;
DROP POLICY IF EXISTS "Anon can insert pixel events" ON public.pixel_events_log;

CREATE POLICY "Authenticated can insert validated pixel events"
ON public.pixel_events_log
FOR INSERT TO authenticated
WITH CHECK (
  event_name IS NOT NULL
  AND length(event_name) BETWEEN 1 AND 100
  AND event_source IN ('browser','server','capi','edge')
  AND (user_id IS NULL OR user_id = auth.uid())
);

CREATE POLICY "Anon can insert validated pixel events"
ON public.pixel_events_log
FOR INSERT TO anon
WITH CHECK (
  event_name IS NOT NULL
  AND length(event_name) BETWEEN 1 AND 100
  AND event_source IN ('browser','server','capi','edge')
  AND user_id IS NULL
);

-- 2) Revoke EXECUTE on SECURITY DEFINER functions that should never be called from the API.
-- Trigger functions are invoked by the database itself, not by clients.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_usage() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies (runs as policy evaluator) — restrict direct EXECUTE
-- to authenticated only; anon should never need to check roles.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3) signup_guards — lock down all writes/reads to admins only (edge functions use service_role and bypass RLS)
CREATE POLICY "Admins can view signup_guards"
ON public.signup_guards FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update signup_guards"
ON public.signup_guards FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete signup_guards"
ON public.signup_guards FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert signup_guards"
ON public.signup_guards FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) user_roles — explicit hard blocks on INSERT/UPDATE/DELETE for client roles (only service_role can write)
CREATE POLICY "Block client inserts on user_roles"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Block client updates on user_roles"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Block client deletes on user_roles"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO anon, authenticated
USING (false);

-- 5) testimonials storage bucket — allow users to delete their own files only
CREATE POLICY "Users can delete own testimonials"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'testimonials'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
