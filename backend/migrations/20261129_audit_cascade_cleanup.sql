-- Preserve the actor FK while permitting database-triggered cascades only.
BEGIN;
CREATE OR REPLACE FUNCTION private.reject_workspace_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Workspace audit events are append-only.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.reject_workspace_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
