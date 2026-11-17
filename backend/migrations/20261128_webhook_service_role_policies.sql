-- Make service-role-only access explicit on private webhook tables.
BEGIN;
CREATE POLICY workspace_webhooks_backend_only ON public.workspace_webhooks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY workspace_webhook_deliveries_backend_only ON public.workspace_webhook_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;
