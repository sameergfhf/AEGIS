-- Append-only security event history for workspace governance and scan activity.
BEGIN;
CREATE TABLE IF NOT EXISTS public.workspace_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  resource_type text NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 80),
  resource_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS workspace_audit_events_time_idx ON public.workspace_audit_events(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS workspace_audit_events_resource_idx ON public.workspace_audit_events(workspace_id, resource_type, resource_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION private.can_view_workspace_audit(target_workspace uuid, target_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = target_workspace AND w.owner_id = target_user)
    OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = target_workspace AND m.user_id = target_user AND m.status = 'active' AND m.role IN ('admin', 'auditor'));
$$;
REVOKE ALL ON FUNCTION private.can_view_workspace_audit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_workspace_audit(uuid, uuid) TO authenticated;

ALTER TABLE public.workspace_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_audit_events_authorized_read ON public.workspace_audit_events
  FOR SELECT TO authenticated USING (private.can_view_workspace_audit(workspace_id, auth.uid()));
REVOKE ALL ON public.workspace_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workspace_audit_events TO authenticated;
GRANT SELECT, INSERT ON public.workspace_audit_events TO service_role;

CREATE OR REPLACE FUNCTION private.reject_workspace_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Permit only database-driven cascading cleanup (for example auth.users
  -- ON DELETE SET NULL), while direct API/SQL mutations stay rejected.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Workspace audit events are append-only.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.reject_workspace_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS workspace_audit_events_append_only ON public.workspace_audit_events;
CREATE TRIGGER workspace_audit_events_append_only BEFORE UPDATE OR DELETE ON public.workspace_audit_events
FOR EACH ROW EXECUTE FUNCTION private.reject_workspace_audit_mutation();

CREATE OR REPLACE FUNCTION private.audit_workspace_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
DECLARE
  n jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  o jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  wid uuid := COALESCE(NULLIF(n->>'workspace_id', '')::uuid, NULLIF(o->>'workspace_id', '')::uuid);
  rid text := COALESCE(n->>'id', o->>'id');
  aid uuid := auth.uid();
  safe jsonb := '{}'::jsonb;
  action_name text := lower(TG_OP);
  request_headers jsonb;
BEGIN
  BEGIN
    request_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    request_headers := '{}'::jsonb;
  END;
  IF wid IS NULL AND TG_TABLE_NAME = 'workspaces' THEN wid := COALESCE(NULLIF(n->>'id', '')::uuid, NULLIF(o->>'id', '')::uuid); END IF;
  IF aid IS NULL THEN aid := COALESCE(NULLIF(n->>'created_by', '')::uuid, NULLIF(n->>'requester_id', '')::uuid, NULLIF(n->>'user_id', '')::uuid); END IF;
  IF TG_OP = 'UPDATE' AND n->>'status' IS DISTINCT FROM o->>'status' THEN action_name := 'status_changed'; END IF;
  IF TG_TABLE_NAME = 'workspace_security_policies' THEN
    safe := jsonb_build_object('name', n->>'name', 'rule_type', n->>'rule_type', 'severity', n->>'severity', 'enabled', n->>'enabled');
  ELSIF TG_TABLE_NAME = 'workspace_incidents' THEN
    safe := jsonb_build_object('title', n->>'title', 'severity', n->>'severity', 'status', n->>'status', 'assigned_to', n->>'assigned_to');
  ELSIF TG_TABLE_NAME = 'workspace_approvals' THEN
    safe := jsonb_build_object('request_type', n->>'request_type', 'status', n->>'status', 'resource_id', n->>'resource_id');
  ELSIF TG_TABLE_NAME = 'workspace_apis' THEN
    safe := jsonb_build_object('name', n->>'name', 'base_origin', regexp_replace(n->>'base_url', '^(https?://[^/]+).*$', '\1'), 'category', n->>'category', 'environment', n->>'environment', 'status', n->>'status');
  ELSIF TG_TABLE_NAME = 'workspace_projects' THEN
    safe := jsonb_build_object('name', n->>'name', 'slug', n->>'slug', 'status', n->>'status');
  ELSIF TG_TABLE_NAME = 'workspace_members' THEN
    safe := jsonb_build_object('user_id', COALESCE(n->>'user_id', o->>'user_id'), 'role', COALESCE(n->>'role', o->>'role'), 'status', COALESCE(n->>'status', o->>'status'));
  ELSIF TG_TABLE_NAME = 'scans' THEN
    rid := n->>'id';
    safe := jsonb_build_object('status', n->>'status', 'score', n->>'score', 'findings_count', n->>'findings_count', 'target_host', split_part(n->>'target_url', '/', 3));
    IF TG_OP = 'INSERT' THEN action_name := 'scan.initiated'; ELSE action_name := 'scan.' || COALESCE(n->>'status', 'updated'); END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (n ? 'status') THEN safe := safe || jsonb_build_object('previous_status', o->>'status'); END IF;
  IF wid IS NOT NULL THEN
    INSERT INTO public.workspace_audit_events(workspace_id, actor_id, action, resource_type, resource_id, correlation_id, metadata)
    VALUES (wid, aid, action_name, TG_TABLE_NAME, rid,
      request_headers->>'x-request-id', safe);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.audit_workspace_row_change() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['workspace_security_policies','workspace_incidents','workspace_approvals','workspace_apis','workspace_projects','workspace_members','scans'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_workspace_change ON public.%I', tab);
    EXECUTE format('CREATE TRIGGER audit_workspace_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_workspace_row_change()', tab);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
