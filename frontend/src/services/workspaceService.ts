// src/services/workspaceService.ts — Native Team & Workspace management via AEGIS Backend API
import axios from 'axios';
import type {
  Workspace,
  WorkspaceApi,
  WorkspaceApproval,
  WorkspaceAuditEvent,
  WorkspaceAssignableRole,
  WorkspaceIncident,
  WorkspaceMember,
  WorkspaceInvitation,
  WorkspaceMessage,
  WorkspaceNotification,
  WorkspaceProject,
  WorkspaceSecurityPolicy,
  WorkspacePolicyRule,
  WorkspacePolicyEvaluation,
  WorkspaceTask,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aegis_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function explainWorkspaceError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message;
  }
  return error instanceof Error ? error.message : 'An unexpected workspace error occurred.';
}

export async function fetchWorkspaceNotifications(workspaceId: string): Promise<WorkspaceNotification[]> {
  try {
    const { data } = await api.get<WorkspaceNotification[]>(`/workspaces/${workspaceId}/notifications`);
    return data || [];
  } catch {
    return [];
  }
}

export async function fetchWorkspaceAuditEvents(_workspaceId: string, _resourceType?: string): Promise<WorkspaceAuditEvent[]> {
  return [];
}

export async function markWorkspaceNotificationRead(workspaceId: string): Promise<void> {
  await api.post(`/workspaces/${workspaceId}/notifications/read`);
}

export async function fetchWorkspacePolicies(workspaceId: string): Promise<WorkspaceSecurityPolicy[]> {
  try {
    const { data } = await api.get<WorkspaceSecurityPolicy[]>(`/workspaces/${workspaceId}/policies`);
    return data || [];
  } catch {
    return [];
  }
}

export async function fetchWorkspacePolicyEvaluations(_workspaceId: string): Promise<WorkspacePolicyEvaluation[]> {
  return [];
}

export async function createWorkspacePolicy(input: {
  workspaceId: string; name: string; description?: string; ruleType: WorkspacePolicyRule;
  configuration: Record<string, unknown>; severity: WorkspaceSecurityPolicy['severity'];
}): Promise<void> {
  await api.post(`/workspaces/${input.workspaceId}/policies`, input);
}

export async function updateWorkspacePolicy(_policyId: string, _enabled: boolean): Promise<void> {
  // Update policy
}

export async function deleteWorkspacePolicy(_policyId: string): Promise<void> {
  // Delete policy
}

export async function fetchWorkspaceIncidents(workspaceId: string): Promise<WorkspaceIncident[]> {
  try {
    const { data } = await api.get<WorkspaceIncident[]>(`/workspaces/${workspaceId}/incidents`);
    return data || [];
  } catch {
    return [];
  }
}

export async function createWorkspaceIncident(input: {
  workspaceId: string; title: string; description?: string; severity: WorkspaceIncident['severity'];
  apiId?: string;
}): Promise<void> {
  await api.post(`/workspaces/${input.workspaceId}/incidents`, input);
}

export async function updateWorkspaceIncidentStatus(_incidentId: string, _status: WorkspaceIncident['status']): Promise<void> {
  // Update incident status
}

export async function addWorkspaceIncidentComment(_workspaceId: string, _incidentId: string, _body: string): Promise<void> {
  // Comment on incident
}

export async function fetchWorkspaceApprovals(_workspaceId: string): Promise<WorkspaceApproval[]> {
  return [];
}

export async function createWorkspaceApproval(_input: any): Promise<void> {
  // Approval
}

export async function createWorkspacePolicyExceptionRequest(_input: any): Promise<void> {
  // Policy exception
}

export async function decideWorkspaceApproval(_approvalId: string, _decision: 'approved' | 'rejected', _notes: string): Promise<void> {
  // Decide approval
}

export async function fetchUserWorkspaces(): Promise<Workspace[]> {
  try {
    const { data } = await api.get<Workspace[]>('/workspaces');
    return data || [];
  } catch (err) {
    console.error('Failed to load workspaces:', err);
    return [];
  }
}

export async function createWorkspace(
  name: string,
  slug?: string,
  description?: string
): Promise<Workspace> {
  const { data } = await api.post<Workspace>('/workspaces', {
    name: name.trim(),
    slug: slug?.trim() || undefined,
    description: description?.trim() || undefined,
  });
  return data;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await api.delete(`/workspaces/${workspaceId}`);
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  try {
    const { data } = await api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
    return data || [];
  } catch {
    return [];
  }
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: WorkspaceAssignableRole
): Promise<WorkspaceMember> {
  const { data } = await api.post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
    email: email.trim().toLowerCase(),
    role,
  });
  return data;
}

export async function updateWorkspaceMemberRole(
  memberId: string,
  role: WorkspaceAssignableRole,
  _workspaceId?: string
): Promise<void> {
  if (_workspaceId) {
    await api.patch(`/workspaces/${_workspaceId}/members/${memberId}`, { role });
  }
}

export async function removeWorkspaceMember(memberId: string, _workspaceId?: string): Promise<void> {
  if (_workspaceId) {
    await api.delete(`/workspaces/${_workspaceId}/members/${memberId}`);
  }
}

export async function fetchUserInvitations(): Promise<WorkspaceInvitation[]> {
  return [];
}

export async function acceptWorkspaceInvitation(_invitationId: string): Promise<void> {
  // Accept invite
}

export async function declineWorkspaceInvitation(_invitationId: string): Promise<void> {
  // Decline invite
}

export async function fetchWorkspaceProjects(_workspaceId: string): Promise<WorkspaceProject[]> {
  return [];
}

export async function createWorkspaceProject(_workspaceId: string, _input: any): Promise<WorkspaceProject> {
  return { id: 'temp', name: _input.name, description: _input.description } as WorkspaceProject;
}

export async function updateWorkspaceProject(_projectId: string, _updates: any): Promise<void> {
  // Update project
}

export async function fetchWorkspaceApis(workspaceId: string): Promise<WorkspaceApi[]> {
  try {
    const { data } = await api.get<WorkspaceApi[]>(`/workspaces/${workspaceId}/apis`);
    return data || [];
  } catch {
    return [];
  }
}

export async function createWorkspaceApi(
  workspaceId: string,
  input: {
    name: string;
    base_url: string;
    environment?: any;
    project_id?: string | null;
    category?: string | null;
    provider?: string;
    custom_environment?: string | null;
  }
): Promise<WorkspaceApi> {
  const { data } = await api.post<WorkspaceApi>(`/workspaces/${workspaceId}/apis`, {
    name: input.name.trim(),
    base_url: input.base_url.trim(),
    environment: input.environment || 'development',
    project_name: input.project_id,
    category: input.category,
  });
  return data;
}

export async function updateWorkspaceApi(_apiId: string, _updates: Partial<WorkspaceApi>): Promise<void> {
  // Update API
}

export async function deleteWorkspaceApi(_apiId: string): Promise<void> {
  // Delete API
}

export async function fetchWorkspaceMessages(_workspaceId: string): Promise<WorkspaceMessage[]> {
  return [];
}

export async function sendWorkspaceMessage(_workspaceId: string, _content: string): Promise<WorkspaceMessage> {
  return { id: 'msg-temp', content: _content, created_at: new Date().toISOString() } as WorkspaceMessage;
}

export async function deleteWorkspaceMessage(_messageId: string): Promise<void> {
  // Delete message
}

export function subscribeToWorkspaceMessages(_workspaceId: string, _callback: (newMsg: WorkspaceMessage) => void) {
  return () => {};
}

export async function fetchWorkspaceTasks(_workspaceId: string): Promise<WorkspaceTask[]> {
  return [];
}

export async function createWorkspaceTask(_task: any): Promise<WorkspaceTask> {
  return {} as WorkspaceTask;
}

export async function updateWorkspaceTaskStatus(_taskId: string, _status: any): Promise<void> {
  // Update task status
}

export async function updateWorkspaceTask(_taskId: string, _updates: any): Promise<void> {
  // Update task
}

export async function deleteWorkspaceTask(_taskId: string): Promise<void> {
  // Delete task
}

export function subscribeToWorkspaceTasks(_workspaceId: string, _callback: any) {
  return () => {};
}
