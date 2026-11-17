-- Backend scan automation needs narrowly scoped service-role access to read
-- workspace policies and create incidents; RLS remains enabled for clients.
BEGIN;
GRANT SELECT ON public.workspace_security_policies TO service_role;
GRANT ALL ON public.workspace_incidents TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
