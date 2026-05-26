
-- Bypass Supabase auth: allow anon role to read/write app data keyed by registered_users.id
ALTER TABLE public.registered_users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- registered_users: allow anon insert + update (auth bypass)
DROP POLICY IF EXISTS "registered_users insert own" ON public.registered_users;
DROP POLICY IF EXISTS "registered_users update own" ON public.registered_users;
DROP POLICY IF EXISTS "registered_users safe columns readable" ON public.registered_users;
CREATE POLICY "registered_users open select" ON public.registered_users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "registered_users open insert" ON public.registered_users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "registered_users open update" ON public.registered_users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT (id, name, avatar_url, total_points, rank, created_at, updated_at, employee_id, date_of_birth) ON public.registered_users TO anon, authenticated;

-- predictions / votes / matches: open to anon
DROP POLICY IF EXISTS "Own predictions readable" ON public.predictions;
DROP POLICY IF EXISTS "Own predictions insert" ON public.predictions;
DROP POLICY IF EXISTS "Own predictions update" ON public.predictions;
DROP POLICY IF EXISTS "Own predictions delete" ON public.predictions;
CREATE POLICY "predictions open all" ON public.predictions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Own votes readable" ON public.votes;
DROP POLICY IF EXISTS "Own votes insert" ON public.votes;
DROP POLICY IF EXISTS "Own votes update" ON public.votes;
CREATE POLICY "votes open all" ON public.votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Matches readable by authenticated" ON public.matches;
CREATE POLICY "matches open select" ON public.matches FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Weekly winners readable" ON public.weekly_winners;
CREATE POLICY "weekly_winners open select" ON public.weekly_winners FOR SELECT TO anon, authenticated USING (true);

-- storage: allow anon to upload/update avatars under any path
DROP POLICY IF EXISTS "Avatars: upload by user folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: update by user folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: read by anyone for known path" ON storage.objects;
CREATE POLICY "avatars open read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars open insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars open update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
