ALTER TABLE public.eligible_employees ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE public.registered_users ADD COLUMN IF NOT EXISTS brand_name text;

CREATE INDEX IF NOT EXISTS registered_users_brand_idx ON public.registered_users (brand_name);
CREATE INDEX IF NOT EXISTS predictions_match_user_idx ON public.predictions (match_id, user_id);
CREATE INDEX IF NOT EXISTS matches_status_time_idx ON public.matches (status, match_time DESC);