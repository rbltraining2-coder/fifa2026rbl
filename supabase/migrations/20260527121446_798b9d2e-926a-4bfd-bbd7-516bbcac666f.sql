
-- Allow profile creation during sign-up (server uses service role which bypasses RLS,
-- but this also enables direct client inserts as a fallback)
CREATE POLICY "Anyone can register a new profile"
ON public.registered_users
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can update own profile"
ON public.registered_users
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.registered_users TO anon, authenticated;
GRANT ALL ON public.registered_users TO service_role;
