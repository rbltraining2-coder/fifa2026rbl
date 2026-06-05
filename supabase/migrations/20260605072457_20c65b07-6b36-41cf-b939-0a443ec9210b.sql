
-- Last login tracking
ALTER TABLE public.registered_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_registered_users_last_login_at ON public.registered_users(last_login_at DESC);

-- Season merchandise rewards (admin-managed)
CREATE TABLE IF NOT EXISTS public.season_merchandise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank int NOT NULL CHECK (rank >= 1 AND rank <= 100),
  name text NOT NULL,
  description text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.season_merchandise TO anon, authenticated;
GRANT ALL ON public.season_merchandise TO service_role;
ALTER TABLE public.season_merchandise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read season merchandise"
  ON public.season_merchandise FOR SELECT
  USING (true);
CREATE INDEX IF NOT EXISTS idx_season_merchandise_rank ON public.season_merchandise(rank);
CREATE INDEX IF NOT EXISTS idx_season_merchandise_active ON public.season_merchandise(active);
CREATE TRIGGER trg_set_updated_at_season_merch
  BEFORE UPDATE ON public.season_merchandise
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Homepage announcement banners (admin-managed)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  start_date timestamptz,
  end_date timestamptz,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read announcements"
  ON public.announcements FOR SELECT
  USING (true);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements(active);
CREATE INDEX IF NOT EXISTS idx_announcements_dates ON public.announcements(start_date, end_date);
CREATE TRIGGER trg_set_updated_at_announcements
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
