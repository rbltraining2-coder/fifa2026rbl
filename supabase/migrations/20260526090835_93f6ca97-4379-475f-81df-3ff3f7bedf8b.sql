
DELETE FROM public.predictions;

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_user_id_fkey;

ALTER TABLE public.predictions
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.registered_users(employee_id)
  ON DELETE CASCADE;
