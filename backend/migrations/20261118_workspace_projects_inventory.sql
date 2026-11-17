-- Workspace projects and registered API inventory, scoped to existing workspaces.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (char_length(btrim(slug)) BETWEEN 1 AND 180),
  description text,
  business_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  technical_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_projects_workspace_slug_key UNIQUE (workspace_id, slug),
  CONSTRAINT workspace_projects_workspace_id_id_key UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.workspace_apis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  base_url text NOT NULL CHECK (char_length(btrim(base_url)) BETWEEN 8 AND 2048)
    CHECK (base_url !~* '^[a-z][a-z0-9+.-]*://[^/?#]*:[^/?#]*@'),
  provider text,
  category text,
  environment text NOT NULL DEFAULT 'development'
    CHECK (environment IN ('development', 'staging', 'production', 'custom')),
  custom_environment text,
  CONSTRAINT workspace_apis_custom_environment_check
    CHECK (environment <> 'custom' OR NULLIF(btrim(custom_environment), '') IS NOT NULL),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_apis_workspace_project_fk
    FOREIGN KEY (workspace_id, project_id)
    REFERENCES public.workspace_projects(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_projects_workspace_status_idx
  ON public.workspace_projects(workspace_id, status, name);
CREATE INDEX IF NOT EXISTS workspace_apis_workspace_project_idx
  ON public.workspace_apis(workspace_id, project_id, status);
CREATE INDEX IF NOT EXISTS workspace_apis_owner_idx
  ON public.workspace_apis(workspace_id, owner_id);

CREATE OR REPLACE FUNCTION public.touch_workspace_project_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_workspace_api_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_workspace_project_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Workspace project identity fields cannot be changed.' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_workspace_api_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Workspace API identity fields cannot be changed.' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS workspace_projects_touch_updated_at ON public.workspace_projects;
CREATE TRIGGER workspace_projects_touch_updated_at BEFORE UPDATE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_project_update();
DROP TRIGGER IF EXISTS workspace_apis_touch_updated_at ON public.workspace_apis;
CREATE TRIGGER workspace_apis_touch_updated_at BEFORE UPDATE ON public.workspace_apis
  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_api_update();

ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_apis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_projects_member_read ON public.workspace_projects;
CREATE POLICY workspace_projects_member_read ON public.workspace_projects
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS workspace_projects_admin_create ON public.workspace_projects;
CREATE POLICY workspace_projects_admin_create ON public.workspace_projects
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_admin(workspace_id, auth.uid()) AND created_by = auth.uid()
    AND (business_owner_id IS NULL OR private.is_workspace_member(workspace_id, business_owner_id))
    AND (technical_owner_id IS NULL OR private.is_workspace_member(workspace_id, technical_owner_id))
  );
DROP POLICY IF EXISTS workspace_projects_admin_update ON public.workspace_projects;
CREATE POLICY workspace_projects_admin_update ON public.workspace_projects
  FOR UPDATE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (
    private.is_workspace_admin(workspace_id, auth.uid())
    AND (business_owner_id IS NULL OR private.is_workspace_member(workspace_id, business_owner_id))
    AND (technical_owner_id IS NULL OR private.is_workspace_member(workspace_id, technical_owner_id))
  );
DROP POLICY IF EXISTS workspace_projects_admin_delete ON public.workspace_projects;
CREATE POLICY workspace_projects_admin_delete ON public.workspace_projects
  FOR DELETE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()));

DROP POLICY IF EXISTS workspace_apis_member_read ON public.workspace_apis;
CREATE POLICY workspace_apis_member_read ON public.workspace_apis
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS workspace_apis_member_create ON public.workspace_apis;
CREATE POLICY workspace_apis_member_create ON public.workspace_apis
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid()) AND created_by = auth.uid()
    AND (owner_id IS NULL OR private.is_workspace_member(workspace_id, owner_id))
    AND EXISTS (
      SELECT 1 FROM public.workspace_projects p
      WHERE p.id = workspace_apis.project_id
        AND p.workspace_id = workspace_apis.workspace_id AND p.status = 'active'
    )
  );
DROP POLICY IF EXISTS workspace_apis_owner_or_admin_update ON public.workspace_apis;
CREATE POLICY workspace_apis_owner_or_admin_update ON public.workspace_apis
  FOR UPDATE TO authenticated
  USING (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (private.is_workspace_admin(workspace_id, auth.uid()) OR created_by = auth.uid())
  )
  WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid())
    AND (owner_id IS NULL OR private.is_workspace_member(workspace_id, owner_id))
    AND EXISTS (
      SELECT 1 FROM public.workspace_projects p
      WHERE p.id = workspace_apis.project_id
        AND p.workspace_id = workspace_apis.workspace_id
    )
  );
DROP POLICY IF EXISTS workspace_apis_admin_delete ON public.workspace_apis;
CREATE POLICY workspace_apis_admin_delete ON public.workspace_apis
  FOR DELETE TO authenticated USING (private.is_workspace_admin(workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_apis TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
