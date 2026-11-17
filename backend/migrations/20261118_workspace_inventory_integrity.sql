-- Ensure custom environments and project scoping remain valid on existing deployments.
BEGIN;
ALTER TABLE public.workspace_apis DROP CONSTRAINT IF EXISTS workspace_apis_custom_environment_check;
ALTER TABLE public.workspace_apis ADD CONSTRAINT workspace_apis_custom_environment_check
  CHECK (environment <> 'custom' OR NULLIF(btrim(custom_environment), '') IS NOT NULL);

DROP POLICY IF EXISTS workspace_apis_member_create ON public.workspace_apis;
CREATE POLICY workspace_apis_member_create ON public.workspace_apis
  FOR INSERT TO authenticated WITH CHECK (
    private.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
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
NOTIFY pgrst, 'reload schema';
COMMIT;
