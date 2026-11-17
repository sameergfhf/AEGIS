-- Server-managed webhook configuration and durable delivery queue.
BEGIN;
CREATE TABLE IF NOT EXISTS public.workspace_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  endpoint_url text NOT NULL CHECK (endpoint_url ~ '^https://'),
  signing_secret_ciphertext text NOT NULL,
  event_types text[] NOT NULL CHECK (cardinality(event_types) > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_webhooks_enabled_idx ON public.workspace_webhooks(workspace_id, enabled);
CREATE TABLE IF NOT EXISTS public.workspace_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES public.workspace_webhooks(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_status_code integer,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (webhook_id, event_id)
);
CREATE INDEX IF NOT EXISTS workspace_webhook_delivery_queue_idx ON public.workspace_webhook_deliveries(status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS workspace_webhook_delivery_history_idx ON public.workspace_webhook_deliveries(workspace_id, created_at DESC);
ALTER TABLE public.workspace_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_webhooks, public.workspace_webhook_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON public.workspace_webhooks, public.workspace_webhook_deliveries TO service_role;
COMMIT;
