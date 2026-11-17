-- Record webhook configuration changes without exposing encrypted secrets.
BEGIN;
DROP TRIGGER IF EXISTS audit_workspace_change ON public.workspace_webhooks;
CREATE TRIGGER audit_workspace_change AFTER INSERT OR UPDATE OR DELETE ON public.workspace_webhooks
FOR EACH ROW EXECUTE FUNCTION private.audit_workspace_row_change();
COMMIT;
