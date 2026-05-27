-- Allow public (anon + authenticated) to upload/update/read avatars bucket
-- This app uses custom auth (employee_id + DOB), not Supabase Auth, so policies cannot use auth.uid()

DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "Avatars public insert" ON storage.objects;
DROP POLICY IF EXISTS "Avatars public update" ON storage.objects;
DROP POLICY IF EXISTS "Avatars public delete" ON storage.objects;

CREATE POLICY "Avatars public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Avatars public insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatars public update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatars public delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'avatars');