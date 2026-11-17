-- Workspace policy alignment, incident tracking, and separated approvals.
-- Workspace data remains in Supabase and is protected by workspace RLS.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_security_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  rule_type text NOT NULL CHECK (rule_type IN (
    'https_required', 'minimum_tls', 'hsts_required', 'csp_required',
    'content_type_options_required', 'minimum_score', 'minimum_coverage',
    'maximum_critical_findings', 'certificate_expiry_days', 'scan_frequency_days'
  )),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  severity text NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled boolean NOT NULL DEFAULT true,
  alert_on_violation boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS workspace_security_policies_enabled_idx
  ON public.workspace_security_policies(workspace_id, enabled, rule_type);

CREATE TABLE IF NOT EXISTS public.workspace_policy_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  scan_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('compliant', 'non_compliant', 'not_applicable', 'inconclusive')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_policy_evaluations_policy_fk
    FOREIGN KEY (workspace_id, policy_id)
    REFERENCES public.workspace_security_policies(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (policy_id, scan_id)
);
CREATE INDEX IF NOT EXISTS workspace_policy_evaluations_scan_idx
  ON public.workspace_policy_evaluations(workspace_id, scan_id, outcome);
CREATE INDEX IF NOT EXISTS workspace_policy_evaluations_time_idx
  ON public.workspace_policy_evaluations(workspace_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS public.workspace_policy_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_id uuid,
  decided_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, policy_id)
    REFERENCES public.workspace_security_policies(workspace_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS workspace_policy_exceptions_active_idx
  ON public.workspace_policy_exceptions(workspace_id, policy_id, expires_at)
  WHERE status = 'approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workspace_apis_workspace_id_id_key') THEN
    ALTER TABLE public.workspace_apis ADD CONSTRAINT workspace_apis_workspace_id_id_key UNIQUE (workspace_id, id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.workspace_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid,
  api_id uuid,
  related_scan_id text,
  finding_ids text[] NOT NULL DEFAULT '{}',
  deduplication_key text,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  description text CHECK (description IS NULL OR char_length(description) <= 10000),
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'acknowledged', 'investigating', 'remediation_in_progress',
    'resolved', 'closed', 'accepted_risk'
  )),
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  due_at timestamptz,
  resolution_notes text CHECK (resolution_notes IS NULL OR char_length(resolution_notes) <= 10000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_incidents_project_fk FOREIGN KEY (workspace_id, project_id)
    REFERENCES public.workspace_projects(workspace_id, id),
  CONSTRAINT workspace_incidents_api_fk FOREIGN KEY (workspace_id, api_id)
    REFERENCES public.workspace_apis(workspace_id, id),
  CONSTRAINT workspace_incidents_workspace_id_id_key UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS workspace_incidents_queue_idx
  ON public.workspace_incidents(workspace_id, status, severity, updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_incidents_assignee_idx
  ON public.workspace_incidents(workspace_id, assigned_to, status);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_incidents_unresolved_finding_key
  ON public.workspace_incidents(workspace_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL AND status NOT IN ('resolved', 'closed');

CREATE TABLE IF NOT EXISTS public.workspace_incident_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, incident_id)
    REFERENCES public.workspace_incidents(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workspace_incident_comments_thread_idx
  ON public.workspace_incident_comments(workspace_id, incident_id, created_at);

CREATE TABLE IF NOT EXISTS public.workspace_incident_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  old_status text,
  new_status text NOT NULL,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, incident_id)
    REFERENCES public.workspace_incidents(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workspace_incident_history_idx
  ON public.workspace_incident_status_history(workspace_id, incident_id, changed_at);

CREATE TABLE IF NOT EXISTS public.workspace_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN (
    'risk_acceptance', 'policy_exception', 'incident_closure',
    'baseline_change', 'integration_configuration'
  )),
  resource_id uuid,
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  requested_action text NOT NULL CHECK (char_length(btrim(requested_action)) BETWEEN 1 AND 1000),
  business_justification text NOT NULL CHECK (char_length(btrim(business_justification)) BETWEEN 1 AND 5000),
  risk_description text NOT NULL CHECK (char_length(btrim(risk_description)) BETWEEN 1 AND 5000),
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(supporting_evidence) = 'object'),
  approver_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  decision_notes text CHECK (decision_notes IS NULL OR char_length(decision_notes) <= 5000),
  expires_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requester_id),
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS workspace_approvals_inbox_idx
  ON public.workspace_approvals(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_approvals_requester_idx
  ON public.workspace_approvals(workspace_id, requester_id, created_at DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workspace_policy_exceptions_approval_fk') THEN
    ALTER TABLE public.workspace_policy_exceptions
      ADD CONSTRAINT workspace_policy_exceptions_approval_fk
      FOREIGN KEY (workspace_id, approval_id)
      REFERENCES public.workspace_approvals(workspace_id, id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.workspace_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'cancelled', 'expired')),
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, approval_id)
    REFERENCES public.workspace_approvals(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workspace_approval_events_timeline_idx
  ON public.workspace_approval_events(workspace_id, approval_id, occurred_at);

CREATE OR REPLACE FUNCTION private.touch_workspace_enterprise_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.touch_workspace_enterprise_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_workspace_approval_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.requested_action IS DISTINCT FROM OLD.requested_action
     OR NEW.business_justification IS DISTINCT FROM OLD.business_justification
     OR NEW.risk_description IS DISTINCT FROM OLD.risk_description
     OR NEW.supporting_evidence IS DISTINCT FROM OLD.supporting_evidence
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Approval request details are immutable after submission.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending approvals can be changed.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'cancelled' THEN
    IF OLD.requester_id <> caller_id OR NEW.decided_by <> caller_id THEN
      RAISE EXCEPTION 'Only the requester can cancel a pending approval.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status IN ('approved', 'rejected', 'expired') THEN
    IF OLD.requester_id = caller_id OR NEW.decided_by IS DISTINCT FROM caller_id
       OR NOT private.is_workspace_admin(OLD.workspace_id, caller_id) THEN
      RAISE EXCEPTION 'A workspace administrator other than the requester must decide this approval.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'approved' AND NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'An approval cannot take effect with an expired date.' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported approval transition.' USING ERRCODE = '42501';
  END IF;
  NEW.decided_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_workspace_approval_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_workspace_incident_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'accepted_risk'
     AND NOT EXISTS (
       SELECT 1 FROM public.workspace_approvals a
       WHERE a.workspace_id = NEW.workspace_id AND a.resource_id = NEW.id
         AND a.request_type = 'risk_acceptance' AND a.status = 'approved'
         AND (a.expires_at IS NULL OR a.expires_at > now())
     ) THEN
    RAISE EXCEPTION 'Accepting incident risk requires a current approved risk-acceptance request.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'closed'
     AND NEW.severity = 'critical'
     AND NOT EXISTS (
       SELECT 1 FROM public.workspace_approvals a
       WHERE a.workspace_id = NEW.workspace_id AND a.resource_id = NEW.id
         AND a.request_type = 'incident_closure' AND a.status = 'approved'
         AND (a.expires_at IS NULL OR a.expires_at > now())
     ) THEN
    RAISE EXCEPTION 'Closing a critical incident requires an approved closure request.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.workspace_incident_status_history(workspace_id, incident_id, changed_by, old_status, new_status)
    VALUES (NEW.workspace_id, NEW.id, auth.uid(), CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status);
  END IF;
  IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_workspace_incident_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspace_security_policies_touch_updated_at ON public.workspace_security_policies;
CREATE TRIGGER workspace_security_policies_touch_updated_at BEFORE UPDATE ON public.workspace_security_policies
FOR EACH ROW EXECUTE FUNCTION private.touch_workspace_enterprise_updated_at();
DROP TRIGGER IF EXISTS workspace_incidents_record_status ON public.workspace_incidents;
CREATE TRIGGER workspace_incidents_record_status BEFORE INSERT OR UPDATE ON public.workspace_incidents
FOR EACH ROW EXECUTE FUNCTION private.record_workspace_incident_status();
DROP TRIGGER IF EXISTS workspace_approvals_guard_update ON public.workspace_approvals;
CREATE TRIGGER workspace_approvals_guard_update BEFORE UPDATE ON public.workspace_approvals
FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_approval_update();
DROP TRIGGER IF EXISTS workspace_approvals_touch_updated_at ON public.workspace_approvals;
CREATE TRIGGER workspace_approvals_touch_updated_at BEFORE UPDATE ON public.workspace_approvals
FOR EACH ROW EXECUTE FUNCTION private.touch_workspace_enterprise_updated_at();

ALTER TABLE public.workspace_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_policy_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_policy_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_incident_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_incident_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_security_policies_member_read ON public.workspace_security_policies
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_security_policies_admin_insert ON public.workspace_security_policies
  FOR INSERT TO authenticated WITH CHECK (private.is_workspace_admin(workspace_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY workspace_security_policies_admin_update ON public.workspace_security_policies
  FOR UPDATE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (private.is_workspace_admin(workspace_id, auth.uid()));
CREATE POLICY workspace_security_policies_admin_delete ON public.workspace_security_policies
  FOR DELETE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY workspace_policy_evaluations_member_read ON public.workspace_policy_evaluations
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY workspace_policy_exceptions_member_read ON public.workspace_policy_exceptions
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_policy_exceptions_member_create ON public.workspace_policy_exceptions
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid())
    AND requested_by = auth.uid() AND status = 'pending' AND approval_id IS NULL
  );

CREATE POLICY workspace_incidents_member_read ON public.workspace_incidents
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_incidents_member_create ON public.workspace_incidents
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid()
    AND (assigned_to IS NULL OR private.is_workspace_member(workspace_id, assigned_to))
  );
CREATE POLICY workspace_incidents_assignee_or_admin_update ON public.workspace_incidents
  FOR UPDATE TO authenticated
  USING (private.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (assigned_to IS NULL OR private.is_workspace_member(workspace_id, assigned_to))
  );
CREATE POLICY workspace_incidents_admin_delete ON public.workspace_incidents
  FOR DELETE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY workspace_incident_comments_member_read ON public.workspace_incident_comments
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_incident_comments_member_create ON public.workspace_incident_comments
  FOR INSERT TO authenticated WITH CHECK (private.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY workspace_incident_comments_author_or_admin_delete ON public.workspace_incident_comments
  FOR DELETE TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()) AND (author_id = auth.uid() OR private.is_workspace_admin(workspace_id, auth.uid())));

CREATE POLICY workspace_incident_history_member_read ON public.workspace_incident_status_history
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY workspace_approvals_member_read ON public.workspace_approvals
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_approvals_member_create ON public.workspace_approvals
  FOR INSERT TO authenticated WITH CHECK (private.is_workspace_member(workspace_id, auth.uid()) AND requester_id = auth.uid() AND status = 'pending');
CREATE POLICY workspace_approvals_requester_cancel_or_admin_decide ON public.workspace_approvals
  FOR UPDATE TO authenticated
  USING (private.is_workspace_member(workspace_id, auth.uid()) AND status = 'pending' AND (requester_id = auth.uid() OR private.is_workspace_admin(workspace_id, auth.uid())))
  WITH CHECK (private.is_workspace_member(workspace_id, auth.uid()) AND status <> 'pending');

CREATE POLICY workspace_approval_events_member_read ON public.workspace_approval_events
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));

REVOKE ALL ON public.workspace_security_policies FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_policy_evaluations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_policy_exceptions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_incidents FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_incident_comments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_incident_status_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_approvals FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.workspace_approval_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_security_policies TO authenticated;
GRANT SELECT ON public.workspace_policy_evaluations TO authenticated;
GRANT ALL ON public.workspace_policy_evaluations TO service_role;
GRANT SELECT, INSERT ON public.workspace_policy_exceptions TO authenticated;
GRANT UPDATE ON public.workspace_policy_exceptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_incidents TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workspace_incident_comments TO authenticated;
GRANT SELECT ON public.workspace_incident_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_approvals TO authenticated;
GRANT SELECT ON public.workspace_approval_events TO authenticated;

-- Decisions are append-only and recorded by a trigger; clients cannot fabricate events.
CREATE OR REPLACE FUNCTION private.record_workspace_approval_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_name := 'requested';
    INSERT INTO public.workspace_approval_events(workspace_id, approval_id, actor_id, event_type)
    VALUES (NEW.workspace_id, NEW.id, NEW.requester_id, event_name);
    IF NEW.request_type = 'policy_exception' THEN
      UPDATE public.workspace_policy_exceptions
      SET approval_id = NEW.id
      WHERE workspace_id = NEW.workspace_id AND id = NEW.resource_id
        AND requested_by = NEW.requester_id AND status = 'pending' AND approval_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The pending policy exception linked to this approval was not found.' USING ERRCODE = '23503';
      END IF;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_name := NEW.status;
    INSERT INTO public.workspace_approval_events(workspace_id, approval_id, actor_id, event_type, notes)
    VALUES (NEW.workspace_id, NEW.id, COALESCE(NEW.decided_by, NEW.requester_id), event_name, NEW.decision_notes);
    IF NEW.request_type = 'policy_exception' AND NEW.resource_id IS NOT NULL
       AND NEW.status IN ('approved', 'rejected') THEN
      UPDATE public.workspace_policy_exceptions
      SET status = NEW.status, approval_id = NEW.id, decided_by = NEW.decided_by
      WHERE workspace_id = NEW.workspace_id AND id = NEW.resource_id AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The pending policy exception linked to this approval was not found.' USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_workspace_approval_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS workspace_approvals_record_event ON public.workspace_approvals;
CREATE TRIGGER workspace_approvals_record_event AFTER INSERT OR UPDATE ON public.workspace_approvals
FOR EACH ROW EXECUTE FUNCTION private.record_workspace_approval_event();

CREATE OR REPLACE FUNCTION public.request_workspace_policy_exception(
  target_policy_id uuid,
  exception_reason text,
  expiration timestamptz,
  business_justification text,
  risk_description text
)
RETURNS public.workspace_approvals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  policy_row public.workspace_security_policies;
  exception_row public.workspace_policy_exceptions;
  approval_row public.workspace_approvals;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to request a policy exception.' USING ERRCODE = '42501';
  END IF;
  IF expiration IS NULL OR expiration <= now() OR expiration > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Exception expiry must be within the next year.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO policy_row FROM public.workspace_security_policies WHERE id = target_policy_id AND enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enabled policy not found.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.workspace_policy_exceptions(workspace_id, policy_id, requested_by, reason, expires_at)
  VALUES (policy_row.workspace_id, policy_row.id, caller_id, btrim(exception_reason), expiration)
  RETURNING * INTO exception_row;
  INSERT INTO public.workspace_approvals(
    workspace_id, request_type, resource_id, requester_id, requested_action,
    business_justification, risk_description, supporting_evidence, expires_at
  ) VALUES (
    policy_row.workspace_id, 'policy_exception', exception_row.id, caller_id,
    'Request time-limited exception to policy: ' || policy_row.name,
    btrim(business_justification), btrim(risk_description), jsonb_build_object('policy_id', policy_row.id), expiration
  ) RETURNING * INTO approval_row;
  RETURN approval_row;
END;
$$;
REVOKE ALL ON FUNCTION public.request_workspace_policy_exception(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_workspace_policy_exception(uuid, text, timestamptz, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
