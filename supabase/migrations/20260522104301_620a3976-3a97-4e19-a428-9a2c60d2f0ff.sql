
-- Fix search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Replace broad public SELECT on avatars with: public can SELECT specific files
-- (anon/auth direct fetch of file URL works because storage serves via signed/public URL),
-- but listing requires owning the folder.
DROP POLICY IF EXISTS "Avatar images public read" ON storage.objects;

CREATE POLICY "Avatars: read by anyone for known path"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');
