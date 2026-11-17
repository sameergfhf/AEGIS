-- AEGIS workspace base schema and access controls.
-- Apply to the same Supabase project configured by frontend/.env.
-- This migration is idempotent for the workspace tables and replaces existing
-- workspace policies with the least-privilege policy set below.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (char_length(btrim(slug)) BETWEEN 1 AND 160),
  description text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'security_analyst'
    CHECK (role IN ('owner', 'admin', 'security_analyst', 'developer', 'auditor', 'viewer', 'member')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('active', 'invited', 'declined')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_workspace_email_key UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON public.workspaces(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_workspace_user_key
  ON public.workspace_members(workspace_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_one_owner_key
  ON public.workspace_members(workspace_id)
  WHERE role = 'owner';
CREATE INDEX IF NOT EXISTS workspace_members_user_status_idx
  ON public.workspace_members(user_id, status);
CREATE INDEX IF NOT EXISTS workspace_members_email_status_idx
  ON public.workspace_members(lower(email), status);

CREATE TABLE IF NOT EXISTS public.workspace_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  sender_name text,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_messages_workspace_created_idx
  ON public.workspace_messages(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS public.workspace_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_email text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_tasks_workspace_created_idx
  ON public.workspace_tasks(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_tasks_assignee_idx
  ON public.workspace_tasks(workspace_id, assigned_to);

-- Safe additions for an older, partially-created workspace schema.
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.workspaces
SET slug = left(
  COALESCE(
    NULLIF(trim(both '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
    'workspace'
  ), 140
) || '-' || left(id::text, 8)
WHERE slug IS NULL OR btrim(slug) = '';
ALTER TABLE public.workspaces ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique_idx ON public.workspaces(slug);
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS joined_at timestamptz;
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'security_analyst', 'developer', 'auditor', 'viewer', 'member'));
ALTER TABLE public.workspace_members ALTER COLUMN role SET DEFAULT 'security_analyst';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_workspace_member(ws_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT ws_id IS NOT NULL AND u_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = ws_id AND w.owner_id = u_id
    ) OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = ws_id AND m.user_id = u_id
        AND m.status = 'active'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_workspace_admin(ws_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT ws_id IS NOT NULL AND u_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = ws_id AND w.owner_id = u_id
    ) OR EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = ws_id AND m.user_id = u_id
        AND m.status = 'active' AND m.role IN ('owner', 'admin')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_workspace_owner(ws_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT ws_id IS NOT NULL AND u_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = ws_id AND w.owner_id = u_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_workspace_invitee(ws_id uuid, invite_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT ws_id IS NOT NULL AND invite_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ws_id AND m.status = 'invited'
      AND lower(m.email) = lower(invite_email)
  );
$function$;

CREATE OR REPLACE FUNCTION public.touch_workspace_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Derive the owner from the JWT, not from a client-supplied owner_id. The
-- authenticated-only INSERT policy relies on this trigger to bind ownership.
CREATE OR REPLACE FUNCTION public.bind_workspace_owner_to_authenticated_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in Supabase user is required to create a workspace.'
      USING ERRCODE = '42501';
  END IF;
  NEW.owner_id := caller_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_workspace_owner_transfer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Workspace ownership transfer must use an audited ownership-transfer flow.'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  owner_email text;
BEGIN
  SELECT lower(u.email) INTO owner_email FROM auth.users u WHERE u.id = NEW.owner_id;
  INSERT INTO public.workspace_members AS existing_member(workspace_id, user_id, email, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_id, COALESCE(owner_email, NEW.owner_id::text || '@local.invalid'), 'owner', 'active', now())
  ON CONFLICT (workspace_id, email) DO UPDATE
    SET user_id = EXCLUDED.user_id, role = 'owner', status = 'active', joined_at = COALESCE(existing_member.joined_at, now());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_workspace_member_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Workspace membership identity fields cannot be changed.' USING ERRCODE = '42501';
  END IF;

  -- An invitation may only be accepted by its intended authenticated email.
  IF OLD.status = 'invited' AND NEW.status = 'active'
     AND NEW.user_id = caller_id AND caller_id IS NOT NULL
     AND lower(OLD.email) = caller_email
     AND NEW.role = OLD.role AND NEW.joined_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
    RAISE EXCEPTION 'Owner membership can only be managed by the workspace creation/ownership flow.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only the invited user may claim an invitation.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_workspace_admin(OLD.workspace_id, caller_id) THEN
    RAISE EXCEPTION 'Only workspace administrators may change member roles.' USING ERRCODE = '42501';
  END IF;
  IF NEW.role = 'admin' AND NOT private.is_workspace_owner(OLD.workspace_id, caller_id) THEN
    RAISE EXCEPTION 'Only the workspace owner may grant administrator access.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
BEGIN
  IF caller_id IS NULL OR caller_email = '' THEN
    RAISE EXCEPTION 'Sign in with the invited email address to accept this invitation.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_members m
  SET user_id = caller_id, status = 'active', joined_at = now()
  WHERE m.id = invitation_id AND m.status = 'invited' AND m.user_id IS NULL
    AND lower(m.email) = caller_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation was not found for this signed-in email, or it has already been used.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Use a narrow, authenticated RPC for workspace creation. The function sets
-- owner_id from the JWT and avoids relying on client-supplied ownership fields.
CREATE OR REPLACE FUNCTION public.create_workspace(
  workspace_name text,
  workspace_slug text,
  workspace_description text DEFAULT NULL
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  created_workspace public.workspaces;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in Supabase user is required to create a workspace.'
      USING ERRCODE = '42501';
  END IF;
  IF workspace_name IS NULL OR char_length(btrim(workspace_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Workspace names must be between 1 and 120 characters.'
      USING ERRCODE = '22023';
  END IF;
  IF workspace_slug IS NULL OR char_length(btrim(workspace_slug)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Workspace slugs must be between 1 and 160 characters.'
      USING ERRCODE = '22023';
  END IF;
  IF workspace_description IS NOT NULL AND char_length(workspace_description) > 2000 THEN
    RAISE EXCEPTION 'Workspace descriptions must be 2,000 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspaces(name, slug, description, owner_id)
  VALUES (btrim(workspace_name), btrim(workspace_slug), workspace_description, caller_id)
  RETURNING * INTO created_workspace;
  RETURN created_workspace;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_workspace_task_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Workspace task identity and creator fields cannot be changed.'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_workspace_created ON public.workspaces;
DROP TRIGGER IF EXISTS workspaces_bind_authenticated_owner ON public.workspaces;
CREATE TRIGGER workspaces_bind_authenticated_owner
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.bind_workspace_owner_to_authenticated_user();
DROP TRIGGER IF EXISTS workspaces_prevent_owner_transfer ON public.workspaces;
CREATE TRIGGER workspaces_prevent_owner_transfer
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_owner_transfer();
DROP TRIGGER IF EXISTS workspaces_touch_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_touch_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_updated_at();
DROP TRIGGER IF EXISTS workspace_owner_membership_after_insert ON public.workspaces;
CREATE TRIGGER workspace_owner_membership_after_insert
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_owner();
DROP TRIGGER IF EXISTS workspace_members_guard_update ON public.workspace_members;
CREATE TRIGGER workspace_members_guard_update
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_member_update();
DROP TRIGGER IF EXISTS workspace_tasks_touch_updated_at ON public.workspace_tasks;
CREATE TRIGGER workspace_tasks_touch_updated_at
  BEFORE UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_task_update();

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;

-- Remove legacy/overlapping permissive policies before installing the complete set.
DO $policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('workspaces', 'workspace_members', 'workspace_messages', 'workspace_tasks')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END;
$policies$;

CREATE POLICY workspaces_member_read ON public.workspaces
  FOR SELECT TO authenticated USING (
    private.is_workspace_member(id, auth.uid())
    OR private.is_workspace_invitee(id, auth.jwt() ->> 'email')
  );
CREATE POLICY workspaces_owner_create ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY workspaces_admin_update ON public.workspaces
  FOR UPDATE TO authenticated USING (private.is_workspace_admin(id, auth.uid()))
  WITH CHECK (private.is_workspace_admin(id, auth.uid()));
CREATE POLICY workspaces_owner_delete ON public.workspaces
  FOR DELETE TO authenticated USING (private.is_workspace_owner(id, auth.uid()));

CREATE POLICY workspace_members_authorized_read ON public.workspace_members
  FOR SELECT TO authenticated USING (
    private.is_workspace_member(workspace_id, auth.uid())
    OR (status = 'invited' AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  );
CREATE POLICY workspace_members_admin_invite ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_admin(workspace_id, auth.uid())
    AND status = 'invited' AND user_id IS NULL AND invited_by = auth.uid()
    AND role IN ('admin', 'security_analyst', 'developer', 'auditor', 'viewer', 'member')
    AND (role <> 'admin' OR private.is_workspace_owner(workspace_id, auth.uid()))
  );
CREATE POLICY workspace_members_admin_update ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (private.is_workspace_admin(workspace_id, auth.uid()) AND role <> 'owner')
  WITH CHECK (
    private.is_workspace_admin(workspace_id, auth.uid())
    AND role IN ('admin', 'security_analyst', 'developer', 'auditor', 'viewer', 'member')
    AND (role <> 'admin' OR private.is_workspace_owner(workspace_id, auth.uid()))
  );
CREATE POLICY workspace_members_admin_or_invitee_delete ON public.workspace_members
  FOR DELETE TO authenticated USING (
    (private.is_workspace_admin(workspace_id, auth.uid()) AND role <> 'owner')
    OR (status = 'invited' AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  );

CREATE POLICY workspace_messages_member_read ON public.workspace_messages
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_messages_member_send ON public.workspace_messages
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid()) AND sender_id = auth.uid()
  );
CREATE POLICY workspace_messages_sender_or_admin_delete ON public.workspace_messages
  FOR DELETE TO authenticated USING (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (sender_id = auth.uid() OR private.is_workspace_admin(workspace_id, auth.uid()))
  );

CREATE POLICY workspace_tasks_member_read ON public.workspace_tasks
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY workspace_tasks_member_create ON public.workspace_tasks
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid()
    AND (assigned_to IS NULL OR private.is_workspace_member(workspace_id, assigned_to))
  );
CREATE POLICY workspace_tasks_member_update ON public.workspace_tasks
  FOR UPDATE TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (assigned_to IS NULL OR private.is_workspace_member(workspace_id, assigned_to))
  );
CREATE POLICY workspace_tasks_creator_or_admin_delete ON public.workspace_tasks
  FOR DELETE TO authenticated USING (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (created_by = auth.uid() OR private.is_workspace_admin(workspace_id, auth.uid()))
  );

REVOKE ALL ON FUNCTION private.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_workspace_invitee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_invitee(uuid, text) TO authenticated;
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_workspace_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_workspace_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_workspace_invitee(uuid, text);
REVOKE ALL ON FUNCTION public.accept_workspace_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_workspace(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bind_workspace_owner_to_authenticated_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_workspace_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_workspace_member_update() FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workspace_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_tasks TO authenticated;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workspace_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workspace_tasks') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_tasks;
    END IF;
  END IF;
END;
$realtime$;

-- PostgREST normally reloads on DDL; notify explicitly for managed Supabase projects.
NOTIFY pgrst, 'reload schema';

COMMIT;
