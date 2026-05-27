
-- 1. Hide date_of_birth from public/auth reads on registered_users.
-- Server functions use service_role which bypasses column grants.
REVOKE SELECT (date_of_birth) ON public.registered_users FROM anon, authenticated;

-- 2. Drop ineffective auth.uid()-based policies on profiles.
-- This app uses registered_users + server-side writes via service_role; profiles
-- writes never happen from the client, so these policies are dead code.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
