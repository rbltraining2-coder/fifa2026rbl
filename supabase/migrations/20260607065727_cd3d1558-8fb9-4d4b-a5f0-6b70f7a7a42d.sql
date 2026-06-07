
CREATE TABLE public.prize_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('daily','weekly','monthly','season')),
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 100),
  label text NOT NULL,
  icon text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_type, rank)
);

GRANT SELECT ON public.prize_labels TO authenticated, anon;
GRANT ALL ON public.prize_labels TO service_role;

ALTER TABLE public.prize_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active prize labels"
  ON public.prize_labels FOR SELECT
  USING (active = true);

CREATE TRIGGER prize_labels_set_updated_at
  BEFORE UPDATE ON public.prize_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
