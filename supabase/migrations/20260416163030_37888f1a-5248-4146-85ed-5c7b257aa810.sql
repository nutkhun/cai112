INSERT INTO storage.buckets (id, name, public) VALUES ('message-images', 'message-images', true);

CREATE POLICY "Anyone can upload message images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'message-images');

CREATE POLICY "Anyone can view message images"
ON storage.objects FOR SELECT
USING (bucket_id = 'message-images');

CREATE POLICY "Anyone can delete message images"
ON storage.objects FOR DELETE
USING (bucket_id = 'message-images');