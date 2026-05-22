ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS rank integer;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS api_id text,
  ADD COLUMN IF NOT EXISTS stage_name text;

CREATE INDEX IF NOT EXISTS idx_matches_api_id ON public.matches(api_id);
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON public.profiles(rank);