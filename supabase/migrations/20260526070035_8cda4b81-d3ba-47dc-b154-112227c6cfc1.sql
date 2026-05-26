ALTER TABLE public.registered_users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.registered_users
  SET is_admin = true
  WHERE employee_id = '50161635';