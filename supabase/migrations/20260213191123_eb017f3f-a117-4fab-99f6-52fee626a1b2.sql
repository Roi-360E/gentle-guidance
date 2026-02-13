
-- Create storage bucket for testimonials
INSERT INTO storage.buckets (id, name, public) VALUES ('testimonials', 'testimonials', false);

-- Allow authenticated users to upload their own testimonial
CREATE POLICY "Users can upload testimonials"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'testimonials' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own testimonials
CREATE POLICY "Users can view own testimonials"
ON storage.objects FOR SELECT
USING (bucket_id = 'testimonials' AND auth.uid()::text = (storage.foldername(name))[1]);
