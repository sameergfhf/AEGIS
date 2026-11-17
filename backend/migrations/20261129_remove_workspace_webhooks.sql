-- Remove the dedicated outbound webhook feature after confirming both tables were empty.
-- Historical create migrations are retained for deployed database migration history.
DROP TABLE IF EXISTS public.workspace_webhook_deliveries;
DROP TABLE IF EXISTS public.workspace_webhooks;
