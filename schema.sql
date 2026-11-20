-- =============================================================================
-- AEGIS Security Platform — Lean Neon PostgreSQL Schema (11 Core Tables)
-- Architecture: Unified Database Layer (Consolidates SQLite + Supabase into Neon)
-- Target: Neon Serverless Postgres (PostgreSQL 15 / 16)
--
-- TABLES (Dependency Order):
--   1. users                       (Auth profile & identity)
--   2. workspaces                  (Team boundaries & tenancy)
--   3. workspace_members           (Team roles & access)
--   4. workspace_apis              (Registered API inventory)
--   5. scans                       (Unified scan executions & results)
--   6. findings                    (Unified security vulnerabilities)
--   7. scheduled_scans             (Recurring scan schedules)
--   8. scheduled_scan_executions   (Execution logs & scheduler leasing)
--   9. workspace_security_policies (Automated security guardrails)
--  10. workspace_incidents         (Actionable security tickets)
--  11. workspace_notifications     (In-app alerts for analysts)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- =============================================================================
-- 1. users
-- Identity records for scan owners, workspace creators, and team members.
-- Populated upon first sign-in via auth callback or JWT trigger.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
    id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255)    NOT NULL UNIQUE CHECK (char_length(trim(email)) BETWEEN 3 AND 255),
    full_name     VARCHAR(150),
    password_hash VARCHAR(255),
    avatar_url    TEXT,
    provider      VARCHAR(32)     NOT NULL DEFAULT 'local',
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (lower(email));

-- =============================================================================
-- 2. workspaces
-- Teams and multi-tenant security boundaries.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120)    NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
    slug        VARCHAR(160)    NOT NULL UNIQUE CHECK (char_length(trim(slug)) BETWEEN 1 AND 160),
    description TEXT,
    owner_id    UUID            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces (slug);

-- =============================================================================
-- 3. workspace_members
-- Team membership and role assignments (Members tab).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id         UUID            REFERENCES public.users(id) ON DELETE CASCADE,
    email           VARCHAR(255)    NOT NULL,
    role            VARCHAR(32)     NOT NULL DEFAULT 'security_analyst'
                        CHECK (role IN ('owner', 'admin', 'security_analyst', 'viewer')),
    status          VARCHAR(20)     NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('active', 'invited')),
    joined_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_workspace_members_workspace_email UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_email ON public.workspace_members (lower(email));

-- =============================================================================
-- 4. workspace_apis
-- Registered API inventory (Inventory tab).
-- Includes optional project_name for logical grouping without extra tables.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_apis (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name                VARCHAR(180)    NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 180),
    base_url            VARCHAR(2048)   NOT NULL CHECK (char_length(trim(base_url)) >= 8),
    environment         VARCHAR(32)     NOT NULL DEFAULT 'development'
                            CHECK (environment IN ('development', 'staging', 'production', 'custom')),
    project_name        VARCHAR(160),
    category            VARCHAR(64),
    status              VARCHAR(20)     NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'archived')),
    created_by          UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_apis_workspace ON public.workspace_apis (workspace_id, status);

-- =============================================================================
-- 5. scans
-- Unified scan runs table (merges backend SQLite execution + frontend state).
-- Stores target URL, status, scores (0-100), points, duration, and rich visual JSON.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scans (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID                REFERENCES public.workspaces(id) ON DELETE SET NULL,
    user_id             UUID                REFERENCES public.users(id) ON DELETE SET NULL,
    url                 VARCHAR(2048)       NOT NULL,
    hostname            VARCHAR(255)        NOT NULL,
    scan_type           VARCHAR(32)         NOT NULL DEFAULT 'full'
                            CHECK (scan_type IN ('full', 'operation')),
    status              VARCHAR(32)         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    assessment_score    NUMERIC(5, 2)       CHECK (assessment_score IS NULL OR assessment_score BETWEEN 0 AND 100),
    earned_points       NUMERIC(5, 2),
    assessed_points     NUMERIC(5, 2),
    assessment_coverage NUMERIC(5, 2),
    passed_checks       INTEGER             NOT NULL DEFAULT 0,
    failed_checks       INTEGER             NOT NULL DEFAULT 0,
    warning_checks      INTEGER             NOT NULL DEFAULT 0,
    inconclusive_checks INTEGER             NOT NULL DEFAULT 0,
    highest_severity    VARCHAR(32)         CHECK (highest_severity IS NULL OR highest_severity IN ('critical', 'high', 'medium', 'low', 'informational')),
    duration_ms         DOUBLE PRECISION,
    result_json         JSONB,              -- Holds flow diagram, latency curves, test breakdown
    error_message       TEXT,
    started_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scans_workspace_started ON public.scans (workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_user_started ON public.scans (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status ON public.scans (status);

-- =============================================================================
-- 6. findings
-- Unified vulnerabilities discovered during scans (TLS, headers, leaks, CVEs).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.findings (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         UUID            NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    title           VARCHAR(256)    NOT NULL,
    category        VARCHAR(64)     NOT NULL, -- tls, headers, leakage, reputation
    severity        VARCHAR(32)     NOT NULL
                        CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
    confidence      VARCHAR(32)     NOT NULL DEFAULT 'possible'
                        CHECK (confidence IN ('confirmed', 'likely', 'possible', 'inconclusive')),
    status          VARCHAR(32)     NOT NULL DEFAULT 'fail'
                        CHECK (status IN ('fail', 'warning', 'pass')),
    evidence        TEXT,
    description     TEXT,
    why_it_matters  TEXT,
    remediation     TEXT,
    rule_reference  VARCHAR(256),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_findings_scan_id ON public.findings (scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON public.findings (severity);

-- =============================================================================
-- 7. scheduled_scans
-- Recurring scan configurations (Automation tab).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_scans (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    api_id              UUID            NOT NULL REFERENCES public.workspace_apis(id) ON DELETE CASCADE,
    name                VARCHAR(160)    NOT NULL,
    url                 VARCHAR(2048)   NOT NULL,
    cadence             VARCHAR(16)     NOT NULL CHECK (cadence IN ('daily', 'weekly', 'interval')),
    local_time          VARCHAR(5)      NOT NULL DEFAULT '02:00',
    weekday             INTEGER         CHECK (weekday BETWEEN 0 AND 6),
    interval_minutes    INTEGER         CHECK (interval_minutes BETWEEN 15 AND 10080),
    timezone_name       VARCHAR(64)     NOT NULL DEFAULT 'UTC',
    enabled             BOOLEAN         NOT NULL DEFAULT true,
    next_run_at         TIMESTAMPTZ     NOT NULL,
    last_run_at         TIMESTAMPTZ,
    lease_until         TIMESTAMPTZ,    -- Optimistic concurrency lock for workers
    created_by          UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_scans_next_run ON public.scheduled_scans (next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_workspace ON public.scheduled_scans (workspace_id);

-- =============================================================================
-- 8. scheduled_scan_executions
-- Execution history and concurrency guard for scheduler runs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_scan_executions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id     UUID            NOT NULL REFERENCES public.scheduled_scans(id) ON DELETE CASCADE,
    scan_id         UUID            REFERENCES public.scans(id) ON DELETE SET NULL,
    scheduled_for   TIMESTAMPTZ     NOT NULL,
    status          VARCHAR(16)     NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
    attempts        INTEGER         NOT NULL DEFAULT 1,
    error           TEXT,
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,

    CONSTRAINT uq_scheduled_scan_execution_slot UNIQUE (schedule_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_executions_schedule ON public.scheduled_scan_executions (schedule_id, started_at DESC);

-- =============================================================================
-- 9. workspace_security_policies
-- Security guardrails and threshold rules (Automation -> Policies tab).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_security_policies (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name                VARCHAR(160)    NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
    rule_type           VARCHAR(64)     NOT NULL CHECK (rule_type IN (
                            'https_required', 'minimum_tls', 'hsts_required',
                            'csp_required', 'content_type_options_required',
                            'minimum_score', 'minimum_coverage',
                            'maximum_critical_findings', 'certificate_expiry_days',
                            'scan_frequency_days'
                        )),
    configuration       JSONB           NOT NULL DEFAULT '{}'::jsonb,
    severity            VARCHAR(32)     NOT NULL DEFAULT 'high'
                            CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    enabled             BOOLEAN         NOT NULL DEFAULT true,
    alert_on_violation  BOOLEAN         NOT NULL DEFAULT true,
    created_by          UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_policies_workspace ON public.workspace_security_policies (workspace_id, enabled);

-- =============================================================================
-- 10. workspace_incidents
-- High/Critical vulnerability tracking tickets (Incidents tab).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_incidents (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    api_id              UUID            REFERENCES public.workspace_apis(id) ON DELETE SET NULL,
    related_scan_id     UUID            REFERENCES public.scans(id) ON DELETE SET NULL,
    title               VARCHAR(240)    NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 240),
    description         TEXT,
    severity            VARCHAR(32)     NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    status              VARCHAR(32)     NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
    assigned_to         UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    resolution_notes    TEXT,
    created_by          UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_incidents_queue ON public.workspace_incidents (workspace_id, status, severity);

-- =============================================================================
-- 11. workspace_notifications
-- Real-time / In-app alerts for analysts (scans failed, policies violated).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_notifications (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID            NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id         UUID            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_type      VARCHAR(64)     NOT NULL
                        CHECK (event_type IN ('finding.created', 'policy.violation', 'scan.failed')),
    title           VARCHAR(240)    NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 240),
    body            TEXT,
    resource_id     TEXT,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_notifications_inbox ON public.workspace_notifications (user_id, read_at, created_at DESC);

-- =============================================================================
-- AUTO-UPDATE TRIGGERS
-- Keeps updated_at timestamps accurate automatically.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['workspaces', 'workspace_apis', 'workspace_incidents'] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;
             CREATE TRIGGER trg_set_updated_at
             BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t, t
        );
    END LOOP;
END;
$$;

COMMIT;
