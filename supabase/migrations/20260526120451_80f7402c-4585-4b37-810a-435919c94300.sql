
-- registered_users: drop open INSERT/UPDATE (admin server fns use service role and bypass RLS)
DROP POLICY IF EXISTS "registered_users open insert" ON public.registered_users;
DROP POLICY IF EXISTS "registered_users open update" ON public.registered_users;

-- Hide date_of_birth from client reads
REVOKE SELECT (date_of_birth) ON public.registered_users FROM anon, authenticated;

-- predictions: drop open ALL, allow only SELECT (for leaderboard/standings). Writes must go through server fns.
DROP POLICY IF EXISTS "predictions open all" ON public.predictions;
CREATE POLICY "predictions public select"
ON public.predictions FOR SELECT TO anon, authenticated USING (true);

-- votes: drop open ALL; no client access (admin/server only)
DROP POLICY IF EXISTS "votes open all" ON public.votes;

-- Avatars storage: drop anon insert/update policies (keep authenticated, folder-scoped policies)
DROP POLICY IF EXISTS "avatars open insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars open update" ON storage.objects;
