-- Cache auth.uid() per statement in the latest policies added for notifications/audit.
BEGIN;
DROP POLICY IF EXISTS workspace_notifications_owner_read ON public.workspace_notifications;
CREATE POLICY workspace_notifications_owner_read ON public.workspace_notifications
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()) AND private.is_workspace_member(workspace_id, (select auth.uid())));
DROP POLICY IF EXISTS workspace_notifications_owner_update ON public.workspace_notifications;
CREATE POLICY workspace_notifications_owner_update ON public.workspace_notifications
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()) AND private.is_workspace_member(workspace_id, (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND private.is_workspace_member(workspace_id, (select auth.uid())));
DROP POLICY IF EXISTS workspace_audit_events_authorized_read ON public.workspace_audit_events;
CREATE POLICY workspace_audit_events_authorized_read ON public.workspace_audit_events
  FOR SELECT TO authenticated USING (private.can_view_workspace_audit(workspace_id, (select auth.uid())));
COMMIT;
