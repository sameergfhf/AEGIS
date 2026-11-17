-- Private in-app notifications for authenticated workspace members.
BEGIN;
CREATE TABLE IF NOT EXISTS public.workspace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('finding.created', 'policy.violation', 'scan.failed')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  resource_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS workspace_notifications_inbox_idx
  ON public.workspace_notifications(user_id, created_at DESC);
ALTER TABLE public.workspace_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_notifications_owner_read ON public.workspace_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_notifications_owner_update ON public.workspace_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND private.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND private.is_workspace_member(workspace_id, auth.uid()));
REVOKE ALL ON public.workspace_notifications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workspace_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.workspace_notifications TO authenticated;
GRANT ALL ON public.workspace_notifications TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
