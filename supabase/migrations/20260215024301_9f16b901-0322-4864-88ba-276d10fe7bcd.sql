
-- Drop the policies that were already created and create only missing ones
DROP POLICY IF EXISTS "Authenticated users can upload testimonials" ON storage.objects;

-- Recreate upload policy
CREATE POLICY "Authenticated users can upload testimonials"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'testimonials'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role policy for admin access
DROP POLICY IF EXISTS "Service role can view all testimonials" ON storage.objects;
CREATE POLICY "Service role can view all testimonials"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'testimonials'
  AND auth.role() = 'service_role'
);
