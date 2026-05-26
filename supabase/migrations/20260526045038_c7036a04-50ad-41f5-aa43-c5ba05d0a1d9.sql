-- Remove the SECURITY DEFINER view flagged by the linter.
DROP VIEW IF EXISTS public.leaderboard_view;

-- Reset SELECT policies so we can apply a single, column-grant-protected rule.
DROP POLICY IF EXISTS "registered_users own row select" ON public.registered_users;

CREATE POLICY "registered_users safe columns readable"
  ON public.registered_users
  FOR SELECT
  TO authenticated
  USING (true);

-- Lock down which columns authenticated clients may reference.
-- date_of_birth and employee_id are deliberately excluded.
REVOKE SELECT ON public.registered_users FROM authenticated;
GRANT SELECT (id, name, avatar_url, total_points, rank, created_at, updated_at)
  ON public.registered_users TO authenticated;