CREATE TABLE public.hidden_reward_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL,
  period_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_key)
);

GRANT SELECT ON public.hidden_reward_periods TO anon;
GRANT SELECT ON public.hidden_reward_periods TO authenticated;
GRANT ALL ON public.hidden_reward_periods TO service_role;

ALTER TABLE public.hidden_reward_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hidden_reward_periods public select"
ON public.hidden_reward_periods FOR SELECT
TO anon, authenticated
USING (true);

CREATE TRIGGER set_hidden_reward_periods_updated_at
BEFORE UPDATE ON public.hidden_reward_periods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();