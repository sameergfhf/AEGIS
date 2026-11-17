# Enterprise Workspace Architecture Audit

## Existing implementation

- Supabase is the persistence and authorization source for workspaces, members, invitations, chat, and tasks. The frontend `WorkspaceContext`, `TeamManagement` page, and workspace components already provide creation, selection, invitations, role changes, chat, and tasks.
- The backend runs the existing scanner and stores active scan execution state in SQLAlchemy (SQLite by default). SQLAlchemy is the authoritative scan execution and application data store. Authenticated scan snapshots/findings are additionally projected to the canonical workspace Supabase project by a backend-only writer.
- TLS, HTTP header, leakage, reputation, scoring, coverage, OpenAPI operation scans, alternative API discovery/scanning, comparisons, visualizations, and PDF reports already exist. URL/IP validation and operation-scan destructive-method confirmation are present.
- The connected Supabase project contains the original workspace tables, projects, API inventory, and the new policy/evaluation/exception, incident/comment/history, and approval/event tables. RLS is enabled on all of them. The Team & Access page now includes a Security Operations tab for managing policy definitions, manual incidents, investigation notes, and approval requests/decisions.

## Security findings and changes

- Backend identity extraction previously trusted `X-User-Id` / `X-User-Email` and decoded JWT payloads without verifying signatures. It now verifies Supabase access-token signatures, issuer, audience, expiry, issued-at, subject UUID, and authenticated role. Asymmetric Supabase keys are loaded from the project JWKS endpoint and refreshed on an unknown key ID; legacy HS256 works only when `SUPABASE_JWT_SECRET` is configured.
- Scan detail, findings, visualization, report, comparison, category, alternative, and history routes now verify personal ownership or active workspace membership. Workspace scan creation checks the centralized permission map. Guest scans remain an explicit feature: their random scan UUID is a bearer capability for viewing and refining that guest scan. A workspace scan always requires verified membership.
- Workspace permissions are centralized in `backend/app/security/workspace_authorization.py`. Existing `member` rows map to Security Analyst permissions during transition. The connected database and frontend now support Security Analyst, Developer, Auditor, and Viewer roles alongside Owner and Admin. RLS and trigger guards still prevent owner transfer, owner membership removal, unrelated invitation acceptance, and member self-escalation.
- Workspace membership helper functions now live in the non-API `private` schema, preventing public RPC calls from probing membership for arbitrary user IDs. RLS policies and trigger guards call the private helpers. The public workspace-creation and invitation-acceptance RPCs remain authenticated and validate their caller.
- Workspace projects and registered API inventory are persisted in Supabase. Every API belongs to one project in the same workspace; RLS scopes reads and writes to active workspace members and managers. Inventory URLs reject embedded credentials and do not execute requests.
- Policy definitions are workspace-admin managed. Completed scans evaluate HTTPS, supported header controls, score, coverage, critical finding count, certificate expiry, and scan frequency. Unsupported or missing evidence is recorded as inconclusive. Evaluation records are read-only to members and writable by the backend service role. Policy exceptions create an approval atomically and expire; only a distinct administrator can decide them.
- High and critical findings create workspace incidents with a stable target/rule deduplication key; the database unique index suppresses duplicate unresolved incidents. Incidents retain the original finding and scan link. In-app alerts are stored per active workspace member for new high/critical findings, policy violations, and failed scans. Incidents support assignment, evidence, comments, due dates, status history, and approval-gated risk acceptance/critical closure.
- Approval requests are immutable after submission, decisions are limited to workspace administrators, database triggers block self-approval, and an append-only event row is written for each request/decision. Decisions do not alter the original scan finding.
- Daily, weekly, and interval schedules are stored in the configured SQLAlchemy database. A 15-second worker claims due runs through atomic database leases, records execution history, retries crashed leases, revalidates SSRF targets, checks that the registered workspace API remains active and that the schedule owner retains scan permission, and creates normal full-scan records. Schedules need a persistent shared production database to survive restarts or coordinate multiple instances; SQLite on ephemeral storage is unsuitable for production.
- Workspace analytics aggregates canonical scans/findings, inventory, incidents, policy evaluations, risk acceptances, and local scheduled execution history through caller-scoped RLS reads. The initial dashboard supports date, severity, member, and scan-status filters; project/API filtering is not applied to scan aggregates because the canonical scans schema does not yet link those dimensions.
- An optional AI finding explainer uses a configured OpenAI-compatible provider. It sends only a recursively redacted, bounded finding summary; scan request/response bodies and auth headers are excluded. The UI labels generated text as suggestions and no AI action changes scan or incident status.
- Workspace creation uses a narrow authenticated `create_workspace` RPC that derives ownership from `auth.uid()`. Trigger-only functions no longer grant direct RPC execution. The table INSERT policy remains limited to `authenticated` and requires `owner_id = (select auth.uid())`.

## Persistence and configuration

- Workspace domain: Supabase project configured by `SUPABASE_AUTH_URL` and `SUPABASE_AUTH_ANON_KEY`; workspace membership checks use the caller's JWT and Supabase RLS.
- Supabase Auth and workspace domain use project `sjgqmjsszlvimafqwdpi`. The previous `SUPABASE_URL` (`pvkeptzxtodwfxlousla`) is legacy configuration and is not used by scan synchronization. SQLAlchemy is the authoritative store for scan execution, scans, findings, reports, history, comparisons, and scan analytics. Supabase retains an RLS-protected authenticated scan projection for workspace consumers. Existing records in the legacy project were not copied or deleted.
- Supabase scan projection writes, workspace governance automation, and persistent scheduled authorization require `SUPABASE_WORKSPACE_SERVICE_ROLE_KEY` for `SUPABASE_AUTH_URL`. It must be a server-only secret/service-role key from project `sjgqmjsszlvimafqwdpi`. It is not configured in the current local backend environment. Remote projection writes and scheduled scans therefore cannot be verified until the deployment operator sets it. The old service key is not reused because its project is different.
- Asymmetric Supabase Auth signing keys need no private key in AEGIS. Legacy HS256 deployments require the server-only `SUPABASE_JWT_SECRET`. Never place any service-role/secret key in frontend configuration.

## Current limitations

- Incident assignment UI, regression reopening, task linking, resolution evidence workflows, configurable alert rules, notification preferences, and overdue incident/approval expiry workers remain incomplete.
- Existing backend tests are scanner-focused. New tests cover verified-token acceptance, expiry, signature, issuer, and forged identity headers; cross-workspace route tests still need a configured async SQLite driver and Supabase test fixtures.
- A Git branch could not be created because this workspace copy has no `.git` metadata.

## Enterprise migration operations

Apply migrations in order to the workspace Supabase project (`sjgqmjsszlvimafqwdpi`):

1. `20261117_workspace_base_schema.sql`
2. `20261118_workspace_projects_inventory.sql`
3. `20261118_workspace_inventory_integrity.sql`
4. `20261119_workspace_policy_incidents_approvals.sql`
5. `20261120_workspace_policy_approval_hardening.sql`
6. `20261121_canonical_scan_persistence.sql`
7. `20261122_governance_automation_service_role.sql`
8. `20261123_workspace_notifications.sql`
9. `20261124_workspace_audit_events.sql`
10. `20261125_workspace_rls_initplan.sql`
14. `20261129_audit_cascade_cleanup.sql`

These changes are additive and preserve existing workspace rows. The enterprise tables are empty at introduction. There is intentionally no destructive automatic rollback: disable the Security Operations tab and stop writes if a rollback is needed, export the new records, then remove the new tables/functions only after confirming retention requirements. Never drop the shared workspace or scan tables as a rollback shortcut.

The RLS insertion failure was caused by clients posting directly to `public.workspaces`. Live Postgres logs showed these direct insert statements before the authenticated RPC was applied. The current frontend calls `public.create_workspace`, and there are no matching RLS errors after the fix migration. Rebuild and redeploy the latest frontend bundle to replace any cached/hosted client. The strict owner-only INSERT policy remains enabled.

## Scan and schedule storage

The backend SQLAlchemy database is authoritative for scans, findings, reports, history, comparisons, workspace scan analytics, schedules, and schedule executions. A server-only Supabase projection is maintained for authenticated workspace consumers when the canonical service key is configured. Configure `DATABASE_URL` to a durable database/volume shared by API and scheduler workers. Supabase project `sjgqmjsszlvimafqwdpi` remains authoritative for Auth, workspaces, membership, and API inventory. Background scan tasks open their own SQLAlchemy sessions.

Persistent schedules catch up every overdue occurrence in slot order after a backend restart; each slot is uniquely recorded and leased, and retry recovery reuses its scan ID. Scheduled execution additionally requires server-only `SUPABASE_WORKSPACE_SERVICE_ROLE_KEY` from `sjgqmjsszlvimafqwdpi`; it is used only by the worker to re-check active API registration and the schedule creator's current workspace permission at execution time. Set it in the backend secret environment and restart the service. Never put it in frontend environment variables.
