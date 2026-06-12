ALTER TABLE public.eligible_employees ADD COLUMN IF NOT EXISTS date_of_joining text;
ALTER TABLE public.registered_users ADD COLUMN IF NOT EXISTS date_of_joining text;