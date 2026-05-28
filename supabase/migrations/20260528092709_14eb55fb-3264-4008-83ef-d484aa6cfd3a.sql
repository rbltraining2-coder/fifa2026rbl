
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'score-sync',
  status TEXT NOT NULL DEFAULT 'success',
  received INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  predictions_scored INTEGER NOT NULL DEFAULT 0,
  users_refreshed INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  failures JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_logs TO anon, authenticated;
GRANT ALL ON public.sync_logs TO service_role;

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_logs open select"
ON public.sync_logs FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX idx_sync_logs_created_at ON public.sync_logs (created_at DESC);
CREATE INDEX idx_sync_logs_status ON public.sync_logs (status);
