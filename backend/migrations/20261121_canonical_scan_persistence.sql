-- Canonical scan, finding, specification, and private artifact persistence in the
-- workspace/Auth Supabase project. SQLAlchemy remains the scanner's execution DB.
BEGIN;

CREATE TABLE IF NOT EXISTS public.scans (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  target_url text NOT NULL CHECK (char_length(target_url) BETWEEN 8 AND 2048),
  scan_type text NOT NULL DEFAULT 'full' CHECK (scan_type IN ('full', 'operation')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  score numeric CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  findings_count integer NOT NULL DEFAULT 0 CHECK (findings_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scans_user_started_idx ON public.scans(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS scans_workspace_started_idx ON public.scans(workspace_id, started_at DESC)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scans_workspace_status_idx ON public.scans(workspace_id, status, started_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.scan_findings (
  id uuid PRIMARY KEY,
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 256),
  description text NOT NULL DEFAULT '',
  severity text NOT NULL,
  endpoint text,
  evidence text NOT NULL DEFAULT '',
  remediation text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_findings_scan_created_idx ON public.scan_findings(scan_id, created_at);
CREATE INDEX IF NOT EXISTS scan_findings_user_idx ON public.scan_findings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.spec_uploads (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 512),
  content text CHECK (content IS NULL OR char_length(content) <= 50000),
  spec_url text,
  version text NOT NULL DEFAULT '3.0.0',
  endpoints integer NOT NULL DEFAULT 0 CHECK (endpoints >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS spec_uploads_user_created_idx ON public.spec_uploads(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_scan_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (auth.uid() IS NULL AND NEW.user_id IS NULL))
     OR (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id AND NOT (auth.uid() IS NULL AND NEW.workspace_id IS NULL)) THEN
    RAISE EXCEPTION 'Scan identity and workspace cannot be changed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_scan_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS scans_guard_identity ON public.scans;
CREATE TRIGGER scans_guard_identity BEFORE UPDATE ON public.scans
FOR EACH ROW EXECUTE FUNCTION private.guard_scan_identity();

CREATE OR REPLACE FUNCTION private.guard_scan_finding_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.scan_id IS DISTINCT FROM OLD.scan_id
     OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (auth.uid() IS NULL AND NEW.user_id IS NULL)) THEN
    RAISE EXCEPTION 'Finding identity and scan association cannot be changed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_scan_finding_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS scan_findings_guard_identity ON public.scan_findings;
CREATE TRIGGER scan_findings_guard_identity BEFORE UPDATE ON public.scan_findings
FOR EACH ROW EXECUTE FUNCTION private.guard_scan_finding_identity();

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY scans_owner_or_workspace_read ON public.scans
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND private.is_workspace_member(workspace_id, auth.uid()))
  );

CREATE POLICY scan_findings_owner_or_workspace_read ON public.scan_findings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.scans s WHERE s.id = scan_id
        AND (s.user_id = auth.uid() OR (s.workspace_id IS NOT NULL AND private.is_workspace_member(s.workspace_id, auth.uid())))
    )
  );
CREATE POLICY spec_uploads_owner_read ON public.spec_uploads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY spec_uploads_owner_create ON public.spec_uploads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY spec_uploads_owner_update ON public.spec_uploads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY spec_uploads_owner_delete ON public.spec_uploads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.scans, public.scan_findings, public.spec_uploads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.scans, public.scan_findings TO authenticated;
GRANT ALL ON public.scans, public.scan_findings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spec_uploads TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('aegis-storage', 'aegis-storage', false, 2097152, ARRAY['application/json', 'text/plain', 'application/yaml', 'text/yaml'])
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY aegis_storage_owner_workspace_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'aegis-storage' AND (
      (split_part(name, '/', 1) = 'specs' AND split_part(name, '/', 2) = auth.uid()::text)
      OR (split_part(name, '/', 1) = 'scans' AND EXISTS (
        SELECT 1 FROM public.scans s WHERE s.id::text = split_part(name, '/', 2)
          AND (s.user_id = auth.uid() OR (s.workspace_id IS NOT NULL AND private.is_workspace_member(s.workspace_id, auth.uid())))
      ))
    )
  );
CREATE POLICY aegis_storage_owner_workspace_create ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'aegis-storage' AND (
      (split_part(name, '/', 1) = 'specs' AND split_part(name, '/', 2) = auth.uid()::text)
    )
  );
CREATE POLICY aegis_storage_owner_workspace_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'aegis-storage' AND (
      (split_part(name, '/', 1) = 'specs' AND split_part(name, '/', 2) = auth.uid()::text)
    )
  ) WITH CHECK (
    bucket_id = 'aegis-storage' AND (
      (split_part(name, '/', 1) = 'specs' AND split_part(name, '/', 2) = auth.uid()::text)
    )
  );
CREATE POLICY aegis_storage_owner_workspace_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'aegis-storage'
    AND split_part(name, '/', 1) = 'specs'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
