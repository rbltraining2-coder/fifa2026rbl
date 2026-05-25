-- Drop the previous credentials table (replaced by eligible_employees)
DROP TABLE IF EXISTS public.employee_credentials;

-- Master roster of eligible corporate employees
CREATE TABLE public.eligible_employees (
  employee_id text PRIMARY KEY,
  name text NOT NULL,
  date_of_birth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eligible_employees ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (server) reads this table.

-- Active registered users (linked to auth.users by id)
CREATE TABLE public.registered_users (
  id uuid PRIMARY KEY,
  employee_id text NOT NULL UNIQUE REFERENCES public.eligible_employees(employee_id),
  name text NOT NULL,
  date_of_birth text NOT NULL,
  avatar_url text,
  total_points integer NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registered_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registered_users readable by authenticated"
  ON public.registered_users FOR SELECT TO authenticated USING (true);

CREATE POLICY "registered_users insert own"
  ON public.registered_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "registered_users update own"
  ON public.registered_users FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE INDEX registered_users_points_idx ON public.registered_users (total_points DESC);

CREATE TRIGGER registered_users_set_updated_at
BEFORE UPDATE ON public.registered_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the master roster
INSERT INTO public.eligible_employees (employee_id, name, date_of_birth) VALUES
  ('50161635', 'Gaurav Indulkar',   '07/03/1997'),
  ('50012353', 'Hirak Shah',        '10-11-79'),
  ('50017334', 'Altaf Khan',        '23-03-1986'),
  ('58021928', 'Kartik Shankar',    '15-11-1985'),
  ('50159492', 'Siddharth Nambiar', '27-12-1981')
ON CONFLICT (employee_id) DO UPDATE
SET name = EXCLUDED.name, date_of_birth = EXCLUDED.date_of_birth;
