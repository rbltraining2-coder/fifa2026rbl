-- 1. Lock down registered_users SELECT to the user's own row only.
DROP POLICY IF EXISTS "registered_users readable by authenticated" ON public.registered_users;

CREATE POLICY "registered_users own row select"
  ON public.registered_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 2. Public-safe leaderboard view (no DOB, no employee_id).
CREATE OR REPLACE VIEW public.leaderboard_view
  WITH (security_invoker = off) AS
  SELECT id, name, avatar_url, total_points, rank, created_at, updated_at
  FROM public.registered_users;

GRANT SELECT ON public.leaderboard_view TO authenticated, anon;

-- 3. Storage: avatars bucket — drop the broad SELECT policy that allows listing.
-- The bucket remains public, so direct file URLs still work via the CDN.
DROP POLICY IF EXISTS "Avatars: read by anyone for known path" ON storage.objects;