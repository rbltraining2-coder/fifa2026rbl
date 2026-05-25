
CREATE TABLE IF NOT EXISTS public.employee_credentials (
  employee_code text PRIMARY KEY,
  date_of_birth date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_credentials ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (server-side login) may read/write.

INSERT INTO public.employee_credentials (employee_code, date_of_birth) VALUES
  ('50161635', '1997-03-07'),
  ('50012353', '1979-11-10')
ON CONFLICT (employee_code) DO UPDATE SET date_of_birth = EXCLUDED.date_of_birth;
