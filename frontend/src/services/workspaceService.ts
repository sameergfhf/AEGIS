// src/services/workspaceService.ts — Team & Workspace management via Supabase
import { supabase } from '../lib/supabase';
import type {
  Workspace,
  WorkspaceApi,
  WorkspaceApproval,
  WorkspaceAuditEvent,
  WorkspaceAssignableRole,
  WorkspaceEnvironment,
  WorkspaceIncident,
  WorkspaceMember,
  WorkspaceInvitation,
  WorkspaceMessage,
  WorkspaceNotification,
  WorkspaceProject,
  WorkspaceRole,
  WorkspaceSecurityPolicy,
  WorkspacePolicyRule,
  WorkspacePolicyEvaluation,
  WorkspaceTask,
} from '../types';

type SupabaseWorkspaceError = { code?: string; message?: string; details?: string; hint?: string };

export async function fetchWorkspaceNotifications(workspaceId: string): Promise<WorkspaceNotification[]> {
  const { data, error } = await supabase.from('workspace_notifications').select('*')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceNotification[];
}

export async function fetchWorkspaceAuditEvents(workspaceId: string, resourceType?: string): Promise<WorkspaceAuditEvent[]> {
  let query = supabase.from('workspace_audit_events').select('*').eq('workspace_id', workspaceId)
    .order('occurred_at', { ascending: false }).limit(200);
  if (resourceType) query = query.eq('resource_type', resourceType);
  const { data, error } = await query;
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceAuditEvent[];
}

export async function markWorkspaceNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('workspace_notifications').update({ read_at: new Date().toISOString() })
    .eq('id', notificationId).is('read_at', null);
  if (error) throw new Error(explainWorkspaceError(error));
}

export function explainWorkspaceError(error: unknown): string {
  const candidate = error as SupabaseWorkspaceError | null;
  const code = candidate?.code || '';
  const message = candidate?.message || (error instanceof Error ? error.message : '');
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sjgqmjsszlvimafqwdpi.supabase.co';
  let projectHost = configuredUrl;
  try { projectHost = new URL(configuredUrl).host; } catch { /* keep the configured value for the diagnostic */ }
  if (code === 'PGRST205' || code === 'PGRST204' || code === '42P01' || /schema cache/i.test(message)) {
    return `The workspace tables are not available in the connected Supabase project (${projectHost}). Apply backend/migrations/20261117_workspace_base_schema.sql and the 20261118 workspace inventory migrations to this project, then let PostgREST reload its schema. Verify the project URL in frontend/.env matches the project where the migrations were applied.`;
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    if (/new row violates row-level security policy for table [\"']workspaces[\"']/i.test(message)) {
      return `Workspace creation is reaching the workspaces table directly, which the secure RLS policy rejects. This app must use the authenticated create_workspace RPC. The source code is fixed; rebuild and redeploy the latest frontend, then reload it without a cached bundle. Frontend project: ${projectHost}.`;
    }
    const diagnostic = [message, candidate?.details, candidate?.hint]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ');
    return `Supabase denied this workspace operation${code ? ` (${code})` : ''}${diagnostic ? `: ${diagnostic}` : '.'} Frontend project: ${projectHost}. Compare this with the project ref in the SQL Editor where the workspace migration was applied.`;
  }
  if (!message || error instanceof TypeError) {
    return 'Could not reach the Supabase project. Verify the frontend Supabase URL points to an active project and try again.';
  }
  return message;
}

export async function fetchWorkspacePolicies(workspaceId: string): Promise<WorkspaceSecurityPolicy[]> {
  const { data, error } = await supabase.from('workspace_security_policies').select('*')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceSecurityPolicy[];
}

export async function fetchWorkspacePolicyEvaluations(workspaceId: string): Promise<WorkspacePolicyEvaluation[]> {
  const { data, error } = await supabase.from('workspace_policy_evaluations').select('*')
    .eq('workspace_id', workspaceId).order('evaluated_at', { ascending: false }).limit(100);
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspacePolicyEvaluation[];
}

export async function createWorkspacePolicy(input: {
  workspaceId: string; name: string; description?: string; ruleType: WorkspacePolicyRule;
  configuration: Record<string, unknown>; severity: WorkspaceSecurityPolicy['severity'];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to create a policy.');
  const { error } = await supabase.from('workspace_security_policies').insert({
    workspace_id: input.workspaceId, name: input.name.trim(), description: input.description?.trim() || null,
    rule_type: input.ruleType, configuration: input.configuration, severity: input.severity, created_by: user.id,
  });
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function updateWorkspacePolicy(policyId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('workspace_security_policies').update({ enabled }).eq('id', policyId);
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function deleteWorkspacePolicy(policyId: string): Promise<void> {
  const { error } = await supabase.from('workspace_security_policies').delete().eq('id', policyId);
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function fetchWorkspaceIncidents(workspaceId: string): Promise<WorkspaceIncident[]> {
  const { data, error } = await supabase.from('workspace_incidents').select('*')
    .eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceIncident[];
}

export async function createWorkspaceIncident(input: {
  workspaceId: string; title: string; description?: string; severity: WorkspaceIncident['severity'];
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to create an incident.');
  const { error } = await supabase.from('workspace_incidents').insert({
    workspace_id: input.workspaceId, title: input.title.trim(), description: input.description?.trim() || null,
    severity: input.severity, priority: input.severity === 'critical' ? 'critical' : input.severity,
    created_by: user.id,
  });
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function updateWorkspaceIncidentStatus(incidentId: string, status: WorkspaceIncident['status']): Promise<void> {
  const { error } = await supabase.from('workspace_incidents').update({ status }).eq('id', incidentId);
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function addWorkspaceIncidentComment(workspaceId: string, incidentId: string, body: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to add an investigation note.');
  const { error } = await supabase.from('workspace_incident_comments').insert({
    workspace_id: workspaceId, incident_id: incidentId, author_id: user.id, body: body.trim(),
  });
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function fetchWorkspaceApprovals(workspaceId: string): Promise<WorkspaceApproval[]> {
  const { data, error } = await supabase.from('workspace_approvals').select('*')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceApproval[];
}

export async function createWorkspaceApproval(input: {
  workspaceId: string; requestType: WorkspaceApproval['request_type']; requestedAction: string;
  businessJustification: string; riskDescription: string; resourceId?: string;
  expiresAt?: string; supportingEvidence?: Record<string, unknown>;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to submit an approval request.');
  const { error } = await supabase.from('workspace_approvals').insert({
    workspace_id: input.workspaceId, request_type: input.requestType, resource_id: input.resourceId || null,
    requester_id: user.id, requested_action: input.requestedAction.trim(),
    business_justification: input.businessJustification.trim(), risk_description: input.riskDescription.trim(),
    expires_at: input.expiresAt || null, supporting_evidence: input.supportingEvidence || {},
  });
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function createWorkspacePolicyExceptionRequest(input: {
  policyId: string; reason: string; expiresAt: string;
  businessJustification: string; riskDescription: string;
}): Promise<void> {
  const { error } = await supabase.rpc('request_workspace_policy_exception', {
    target_policy_id: input.policyId,
    exception_reason: input.reason.trim(),
    expiration: input.expiresAt,
    business_justification: input.businessJustification.trim(),
    risk_description: input.riskDescription.trim(),
  });
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function decideWorkspaceApproval(approvalId: string, decision: 'approved' | 'rejected', notes: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to decide an approval.');
  const { error } = await supabase.from('workspace_approvals').update({
    status: decision, decided_by: user.id, decision_notes: notes.trim() || null,
  }).eq('id', approvalId).eq('status', 'pending');
  if (error) throw new Error(explainWorkspaceError(error));
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function fetchUserWorkspaces(): Promise<Workspace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const userEmail = (user.email || '').trim().toLowerCase();

  // Fetch workspaces user owns or has access to via RLS
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(explainWorkspaceError(error));
  }

  // Also fetch member records for this user to attach their roles
  const { data: memberRows, error: membersError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, status')
    .or(`user_id.eq.${user.id},email.ilike.${userEmail}`);
  if (membersError) throw new Error(explainWorkspaceError(membersError));

  const roleMap = new Map<string, WorkspaceRole>();
  const activeWsIds = new Set<string>();

  (memberRows || []).forEach((m: any) => {
    if (m.status === 'active' || !m.status) {
      activeWsIds.add(m.workspace_id);
      roleMap.set(m.workspace_id, m.role);
    }
  });

  // Filter to workspaces where user is owner or active member
  return (data || [])
    .filter((ws: any) => ws.owner_id === user.id || activeWsIds.has(ws.id))
    .map((ws: any) => ({
      ...ws,
      role: ws.owner_id === user.id ? 'owner' : (roleMap.get(ws.id) || 'security_analyst'),
    }));
}

export async function createWorkspace(
  name: string,
  description?: string
): Promise<Workspace> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your Supabase session: ${authError.message}`);
  if (!user) throw new Error('You must be signed in to create a workspace.');

  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter a workspace name.');
  if (cleanName.length > 120) throw new Error('Workspace names must be 120 characters or fewer.');
  const cleanDescription = description?.trim() || null;
  if (cleanDescription && cleanDescription.length > 2000) throw new Error('Workspace descriptions must be 2,000 characters or fewer.');

  const slug = cleanName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'workspace';

  const { data, error } = await supabase.rpc('create_workspace', {
    workspace_name: cleanName,
    workspace_slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
    workspace_description: cleanDescription,
  });

  if (error || !data) {
    throw new Error(error ? explainWorkspaceError(error) : 'Supabase did not return the created workspace. Please retry.');
  }

  return {
    ...data,
    role: 'owner',
  };
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);

  if (error) throw new Error(error.message);
}

// ── Workspace Members & Invitations ───────────────────────────────────────────

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(explainWorkspaceError(error));
  }
  return data || [];
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: WorkspaceAssignableRole = 'security_analyst'
): Promise<WorkspaceMember> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to invite members.');

  const trimmedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      email: trimmedEmail,
      role,
      status: 'invited',
      invited_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to invite team member.');
  }

  return data;
}

export async function updateWorkspaceMemberRole(
  memberId: string,
  role: WorkspaceAssignableRole
): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}

export async function removeWorkspaceMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}

export async function fetchUserInvitations(): Promise<WorkspaceInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return [];

  const userEmail = user.email.trim().toLowerCase();

  // Fetch pending invitations matching this user's email or user_id
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      id,
      workspace_id,
      email,
      role,
      status,
      invited_by,
      joined_at,
      created_at,
      workspaces:workspace_id (
        name,
        description,
        slug
      )
    `)
    .eq('status', 'invited')
    .or(`email.ilike.${userEmail},user_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(explainWorkspaceError(error));
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invited_by: row.invited_by,
    joined_at: row.joined_at,
    created_at: row.created_at,
    workspace_name: row.workspaces?.name || 'Security Workspace',
    workspace_description: row.workspaces?.description || null,
  }));
}

export async function acceptWorkspaceInvitation(invitationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to accept an invitation.');

  const { error } = await supabase.rpc('accept_workspace_invitation', { invitation_id: invitationId });

  if (error) throw new Error(error.message);
}

export async function declineWorkspaceInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', invitationId);

  if (error) throw new Error(error.message);
}

// ── Workspace projects and API inventory ─────────────────────────────────────

export async function fetchWorkspaceProjects(workspaceId: string): Promise<WorkspaceProject[]> {
  const { data, error } = await supabase
    .from('workspace_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceProject[];
}

export async function createWorkspaceProject(
  workspaceId: string,
  input: Pick<WorkspaceProject, 'name' | 'description'>
): Promise<WorkspaceProject> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your Supabase session: ${authError.message}`);
  if (!user) throw new Error('Sign in to create a project.');
  const name = input.name.trim();
  if (!name || name.length > 160) throw new Error('Project names must be between 1 and 160 characters.');
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
  const { data, error } = await supabase
    .from('workspace_projects')
    .insert({
      workspace_id: workspaceId,
      name,
      slug: `${slugBase}-${crypto.randomUUID().slice(0, 8)}`,
      description: input.description?.trim() || null,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error ? explainWorkspaceError(error) : 'Supabase did not return the created project.');
  return data as WorkspaceProject;
}

export async function updateWorkspaceProject(
  projectId: string,
  updates: Partial<Pick<WorkspaceProject, 'name' | 'description' | 'status' | 'business_owner_id' | 'technical_owner_id'>>
): Promise<void> {
  const { error } = await supabase.from('workspace_projects').update(updates).eq('id', projectId);
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function fetchWorkspaceApis(workspaceId: string): Promise<WorkspaceApi[]> {
  const { data, error } = await supabase
    .from('workspace_apis')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (error) throw new Error(explainWorkspaceError(error));
  return (data || []) as WorkspaceApi[];
}

export async function createWorkspaceApi(
  workspaceId: string,
  input: {
    project_id: string;
    name: string;
    base_url: string;
    provider?: string;
    category?: string;
    environment: WorkspaceEnvironment;
    custom_environment?: string;
  }
): Promise<WorkspaceApi> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your Supabase session: ${authError.message}`);
  if (!user) throw new Error('Sign in to register an API.');
  const name = input.name.trim();
  if (!name || name.length > 180) throw new Error('API names must be between 1 and 180 characters.');
  let target: URL;
  try { target = new URL(input.base_url.trim()); } catch { throw new Error('Enter a valid API base URL.'); }
  if (!['http:', 'https:'].includes(target.protocol) || !target.hostname || target.username || target.password) {
    throw new Error('API URLs must use HTTP or HTTPS and cannot contain embedded credentials.');
  }
  if (target.href.length > 2048) throw new Error('API URLs must be 2,048 characters or fewer.');
  if (input.environment === 'custom' && !input.custom_environment?.trim()) {
    throw new Error('Enter a name for the custom environment.');
  }
  const { data, error } = await supabase
    .from('workspace_apis')
    .insert({
      workspace_id: workspaceId,
      project_id: input.project_id,
      name,
      base_url: target.origin + target.pathname.replace(/\/$/, ''),
      provider: input.provider?.trim() || null,
      category: input.category?.trim() || null,
      environment: input.environment,
      custom_environment: input.environment === 'custom' ? input.custom_environment?.trim() : null,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error ? explainWorkspaceError(error) : 'Supabase did not return the registered API.');
  return data as WorkspaceApi;
}

export async function updateWorkspaceApi(
  apiId: string,
  updates: Partial<Pick<WorkspaceApi, 'name' | 'base_url' | 'provider' | 'category' | 'environment' | 'custom_environment' | 'owner_id' | 'status'>>
): Promise<void> {
  const { error } = await supabase.from('workspace_apis').update(updates).eq('id', apiId);
  if (error) throw new Error(explainWorkspaceError(error));
}

export async function deleteWorkspaceApi(apiId: string): Promise<void> {
  const { error } = await supabase.from('workspace_apis').delete().eq('id', apiId);
  if (error) throw new Error(explainWorkspaceError(error));
}

// ── Workspace Conversations / Chat ───────────────────────────────────────────

export async function fetchWorkspaceMessages(workspaceId: string): Promise<WorkspaceMessage[]> {
  const { data, error } = await supabase
    .from('workspace_messages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Error fetching workspace messages:', error.message);
    return [];
  }
  return data || [];
}

export async function sendWorkspaceMessage(
  workspaceId: string,
  content: string
): Promise<WorkspaceMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to send a message.');

  const senderName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Analyst';

  const { data, error } = await supabase
    .from('workspace_messages')
    .insert({
      workspace_id: workspaceId,
      sender_id: user.id,
      sender_email: user.email || 'operator@aegis.sec',
      sender_name: senderName,
      content: content.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to send message.');
  }

  return data;
}

export async function deleteWorkspaceMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_messages')
    .delete()
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export function subscribeToWorkspaceMessages(
  workspaceId: string,
  onMessage: (message: WorkspaceMessage) => void
) {
  const channel = supabase
    .channel(`workspace-messages-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'workspace_messages',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        if (payload.new) {
          onMessage(payload.new as WorkspaceMessage);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Workspace Task Assignments ───────────────────────────────────────────────

export async function fetchWorkspaceTasks(workspaceId: string): Promise<WorkspaceTask[]> {
  const { data, error } = await supabase
    .from('workspace_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching workspace tasks:', error.message);
    return [];
  }
  return data || [];
}

export async function createWorkspaceTask(task: {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string | null;
  assignedEmail?: string | null;
  dueDate?: string | null;
}): Promise<WorkspaceTask> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to create a task.');

  const { data, error } = await supabase
    .from('workspace_tasks')
    .insert({
      workspace_id: task.workspaceId,
      title: task.title.trim(),
      description: task.description?.trim() || null,
      priority: task.priority || 'medium',
      status: 'todo',
      assigned_to: task.assignedTo || null,
      assigned_email: task.assignedEmail || null,
      created_by: user.id,
      due_date: task.dueDate || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create workspace task.');
  }

  return data;
}

export async function updateWorkspaceTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled'
): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function updateWorkspaceTask(
  taskId: string,
  updates: Partial<Pick<WorkspaceTask, 'title' | 'description' | 'status' | 'priority' | 'assigned_to' | 'assigned_email' | 'due_date'>>
): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export async function deleteWorkspaceTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new Error(error.message);
}

export function subscribeToWorkspaceTasks(
  workspaceId: string,
  onChange: () => void
) {
  const channel = supabase
    .channel(`workspace-tasks-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'workspace_tasks',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
