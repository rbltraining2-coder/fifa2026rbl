
-- ============ PROFILES (users) ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ MATCHES ============
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_flag TEXT,
  away_flag TEXT,
  match_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | live | completed
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches readable by authenticated" ON public.matches
  FOR SELECT TO authenticated USING (true);

-- ============ PREDICTIONS ============
CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  winner TEXT, -- 'home' | 'draw' | 'away'
  predicted_home_score INTEGER,
  predicted_away_score INTEGER,
  total_goals_bucket TEXT, -- 'under_2_5' | 'between_2_3' | 'over_3_5'
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own predictions readable" ON public.predictions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own predictions insert" ON public.predictions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own predictions update" ON public.predictions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own predictions delete" ON public.predictions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ VOTES ============
CREATE TABLE public.votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  voted_team TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own votes readable" ON public.votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own votes insert" ON public.votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own votes update" ON public.votes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ WEEKLY WINNERS ============
CREATE TABLE public.weekly_winners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number INTEGER NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weekly winners readable" ON public.weekly_winners
  FOR SELECT TO authenticated USING (true);

-- ============ STORAGE: avatars bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images public read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER predictions_updated BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Seed sample matches ============
INSERT INTO public.matches (home_team, away_team, home_flag, away_flag, match_time, status, home_score, away_score) VALUES
  ('Brazil', 'Argentina', '🇧🇷', '🇦🇷', now() + interval '3 hours', 'scheduled', NULL, NULL),
  ('France', 'Germany', '🇫🇷', '🇩🇪', now() + interval '6 hours', 'scheduled', NULL, NULL),
  ('Spain', 'Portugal', '🇪🇸', '🇵🇹', now() + interval '1 day', 'scheduled', NULL, NULL),
  ('England', 'Italy', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇮🇹', now() + interval '2 days', 'scheduled', NULL, NULL),
  ('Netherlands', 'Belgium', '🇳🇱', '🇧🇪', now() + interval '3 days', 'scheduled', NULL, NULL),
  ('Croatia', 'Morocco', '🇭🇷', '🇲🇦', now() - interval '2 days', 'completed', 2, 1),
  ('Japan', 'South Korea', '🇯🇵', '🇰🇷', now() - interval '5 days', 'completed', 1, 1);
