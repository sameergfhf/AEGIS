// src/contexts/WorkspaceContext.tsx — Global workspace/team state and management
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchUserWorkspaces,
  createWorkspace as apiCreateWorkspace,
  fetchWorkspaceMembers,
  inviteWorkspaceMember as apiInviteMember,
  removeWorkspaceMember as apiRemoveMember,
  updateWorkspaceMemberRole as apiUpdateRole,
  deleteWorkspace as apiDeleteWorkspace,
  fetchUserInvitations as apiFetchInvitations,
  acceptWorkspaceInvitation as apiAcceptInvitation,
  declineWorkspaceInvitation as apiDeclineInvitation,
} from '../services/workspaceService';
import type { Workspace, WorkspaceAssignableRole, WorkspaceMember, WorkspaceInvitation } from '../types';
import { explainWorkspaceError } from '../services/workspaceService';
import toast from 'react-hot-toast';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  isLoading: boolean;
  workspaceError: string | null;
  isOwnerOrAdmin: boolean;
  setCurrentWorkspace: (ws: Workspace | null) => void;
  refreshWorkspaces: () => Promise<Workspace[]>;
  refreshInvitations: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  inviteMember: (email: string, role?: WorkspaceAssignableRole) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  updateMemberRole: (memberId: string, role: WorkspaceAssignableRole) => Promise<void>;
  deleteCurrentWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const ACTIVE_WS_KEY = 'aegis_active_workspace_id';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const setCurrentWorkspace = (ws: Workspace | null) => {
    setCurrentWorkspaceState(ws);
    if (ws?.id) {
      localStorage.setItem(ACTIVE_WS_KEY, ws.id);
    } else {
      localStorage.removeItem(ACTIVE_WS_KEY);
    }
  };

  const loadMembers = useCallback(async (wsId: string) => {
    try {
      const data = await fetchWorkspaceMembers(wsId);
      setMembers(data);
    } catch (err) {
      setMembers([]);
      setWorkspaceError(explainWorkspaceError(err));
    }
  }, []);

  const refreshInvitations = useCallback(async () => {
    if (!user) {
      setInvitations([]);
      return;
    }
    try {
      const list = await apiFetchInvitations();
      setInvitations(list);
    } catch (err) {
      console.warn('Failed to load invitations:', err);
      setInvitations([]);
      setWorkspaceError(explainWorkspaceError(err));
    }
  }, [user]);

  const refreshWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setMembers([]);
      setInvitations([]);
      setWorkspaceError(null);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setWorkspaceError(null);
    try {
      const [list, invites] = await Promise.all([
        fetchUserWorkspaces(),
        apiFetchInvitations(),
      ]);
      setWorkspaces(list);
      setInvitations(invites);

      // Select active workspace from localStorage or default to first
      const savedId = localStorage.getItem(ACTIVE_WS_KEY);
      const match = list.find((w) => w.id === savedId) || list[0] || null;

      setCurrentWorkspace(match);
      return list;
    } catch (err) {
      const message = explainWorkspaceError(err);
      console.warn('Failed to load workspaces:', message);
      setWorkspaceError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadMembers(currentWorkspace.id);
    } else {
      setMembers([]);
    }
  }, [currentWorkspace?.id, loadMembers]);

  const createWorkspace = async (name: string, description?: string): Promise<Workspace> => {
    const ws = await apiCreateWorkspace(name, description);
    toast.success(`Workspace "${ws.name}" created!`);
    setWorkspaces((current) => [ws, ...current.filter((item) => item.id !== ws.id)]);
    setCurrentWorkspace(ws);
    await refreshWorkspaces();
    setCurrentWorkspace(ws);
    return ws;
  };

  const inviteMember = async (email: string, role: WorkspaceAssignableRole = 'security_analyst'): Promise<void> => {
    if (!currentWorkspace) throw new Error('No active workspace selected.');
    await apiInviteMember(currentWorkspace.id, email, role);
    toast.success(`Invitation sent to ${email}`);
    await loadMembers(currentWorkspace.id);
  };

  const acceptInvitation = async (invitationId: string): Promise<void> => {
    const invite = invitations.find((i) => i.id === invitationId);
    await apiAcceptInvitation(invitationId);
    toast.success(`Joined workspace ${invite?.workspace_name ? `"${invite.workspace_name}"` : ''}!`);
    const refreshed = await refreshWorkspaces();
    await refreshInvitations();
    if (invite?.workspace_id) {
      const found = refreshed.find((w) => w.id === invite.workspace_id);
      if (found) setCurrentWorkspace(found);
    }
  };

  const declineInvitation = async (invitationId: string): Promise<void> => {
    await apiDeclineInvitation(invitationId);
    toast.success('Invitation declined');
    await refreshInvitations();
  };

  const removeMember = async (memberId: string): Promise<void> => {
    if (!currentWorkspace) return;
    await apiRemoveMember(memberId);
    toast.success('Member removed');
    await loadMembers(currentWorkspace.id);
  };

  const updateMemberRole = async (memberId: string, role: WorkspaceAssignableRole): Promise<void> => {
    if (!currentWorkspace) return;
    await apiUpdateRole(memberId, role);
    toast.success('Member role updated');
    await loadMembers(currentWorkspace.id);
  };

  const deleteCurrentWorkspace = async (): Promise<void> => {
    if (!currentWorkspace) return;
    await apiDeleteWorkspace(currentWorkspace.id);
    toast.success('Workspace deleted');
    await refreshWorkspaces();
  };

  const currentMember = members.find((m) => m.user_id === user?.id || (user?.email && m.email.toLowerCase() === user.email.toLowerCase()));
  const isOwnerOrAdmin =
    currentWorkspace?.owner_id === user?.id ||
    currentMember?.role === 'owner' ||
    currentMember?.role === 'admin';

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        members,
        invitations,
        isLoading,
        workspaceError,
        isOwnerOrAdmin,
        setCurrentWorkspace,
        refreshWorkspaces,
        refreshInvitations,
        createWorkspace,
        inviteMember,
        acceptInvitation,
        declineInvitation,
        removeMember,
        updateMemberRole,
        deleteCurrentWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
