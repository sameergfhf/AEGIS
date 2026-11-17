-- Approval separation-of-duties and policy exception workflow hardening.
BEGIN;

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_incidents TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workspace_incident_comments TO authenticated;
GRANT SELECT ON public.workspace_incident_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_approvals TO authenticated;
GRANT SELECT ON public.workspace_approval_events TO authenticated;

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

CREATE OR REPLACE FUNCTION private.record_workspace_approval_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = 'off' AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.workspace_approval_events(workspace_id, approval_id, actor_id, event_type)
    VALUES (NEW.workspace_id, NEW.id, NEW.requester_id, 'requested');
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
      SET status = NEW.status, decided_by = NEW.decided_by
      WHERE workspace_id = NEW.workspace_id AND id = NEW.resource_id AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The pending policy exception linked to this approval was not found.' USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  IF char_length(btrim(COALESCE(exception_reason, ''))) NOT BETWEEN 1 AND 5000
     OR char_length(btrim(COALESCE(business_justification, ''))) NOT BETWEEN 1 AND 5000
     OR char_length(btrim(COALESCE(risk_description, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Exception reason, business justification, and risk description are required.' USING ERRCODE = '22023';
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
