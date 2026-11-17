import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Boxes, Globe2, Plus, Server } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  createWorkspaceApi,
  createWorkspaceProject,
  fetchWorkspaceApis,
  fetchWorkspaceProjects,
  updateWorkspaceApi,
  updateWorkspaceProject,
} from '../../services/workspaceService';
import { explainWorkspaceError } from '../../services/workspaceService';
import type { WorkspaceApi, WorkspaceEnvironment, WorkspaceProject } from '../../types';
import { Badge, Button, EmptyState, Modal, Spinner } from '../ui';

type InventoryView = 'projects' | 'apis';

const environments: WorkspaceEnvironment[] = ['development', 'staging', 'production', 'custom'];

export default function WorkspaceInventory() {
  const { user } = useAuth();
  const { currentWorkspace, isOwnerOrAdmin } = useWorkspace();
  const [view, setView] = useState<InventoryView>('projects');
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [apis, setApis] = useState<WorkspaceApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [apiName, setApiName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiProvider, setApiProvider] = useState('');
  const [apiCategory, setApiCategory] = useState('');
  const [apiEnvironment, setApiEnvironment] = useState<WorkspaceEnvironment>('development');
  const [customEnvironment, setCustomEnvironment] = useState('');
  const [apiProjectId, setApiProjectId] = useState('');

  const reload = useCallback(async () => {
    if (!currentWorkspace) {
      setProjects([]);
      setApis([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextProjects, nextApis] = await Promise.all([
        fetchWorkspaceProjects(currentWorkspace.id),
        fetchWorkspaceApis(currentWorkspace.id),
      ]);
      setProjects(nextProjects);
      setApis(nextApis);
    } catch (cause) {
      setError(explainWorkspaceError(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { void reload(); }, [reload]);

  const activeProjects = useMemo(() => projects.filter((project) => project.status === 'active'), [projects]);
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspaceProject(currentWorkspace.id, { name: projectName, description: projectDescription });
      setProjectName('');
      setProjectDescription('');
      setProjectDialogOpen(false);
      toast.success('Project created');
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateApi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspaceApi(currentWorkspace.id, {
        project_id: apiProjectId,
        name: apiName,
        base_url: apiUrl,
        provider: apiProvider,
        category: apiCategory,
        environment: apiEnvironment,
        custom_environment: customEnvironment,
      });
      setApiName('');
      setApiUrl('');
      setApiProvider('');
      setApiCategory('');
      setCustomEnvironment('');
      setApiDialogOpen(false);
      toast.success('API registered');
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not register API.');
    } finally {
      setSubmitting(false);
    }
  };

  const archiveProject = async (project: WorkspaceProject) => {
    if (!confirm(`Archive project “${project.name}”? APIs in this project will remain in inventory.`)) return;
    try {
      await updateWorkspaceProject(project.id, { status: 'archived' });
      toast.success('Project archived');
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not archive project.');
    }
  };

  const archiveApi = async (api: WorkspaceApi) => {
    if (!confirm(`Archive API “${api.name}”?`)) return;
    try {
      await updateWorkspaceApi(api.id, { status: 'archived' });
      toast.success('API archived');
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not archive API.');
    }
  };

  if (!currentWorkspace) {
    return <EmptyState icon={Boxes} title="Select a workspace" description="Projects and API inventory are scoped to a team workspace." />;
  }

  return (
    <section aria-label="Projects and API inventory" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 border-b border-line" role="tablist" aria-label="Workspace inventory views">
          {(['projects', 'apis'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => setView(item)}
              className={`min-h-10 border-b-2 px-3 font-mono text-[10px] uppercase tracking-[0.08em] ${view === item ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {item === 'projects' ? `Projects (${activeProjects.length})` : `API inventory (${apis.filter((api) => api.status === 'active').length})`}
            </button>
          ))}
        </div>
        {view === 'projects' && isOwnerOrAdmin ? (
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setProjectDialogOpen(true)}>
            New project
          </Button>
        ) : null}
        {view === 'apis' ? (
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} disabled={activeProjects.length === 0} onClick={() => { setApiProjectId(activeProjects[0]?.id || ''); setApiDialogOpen(true); }}>
            Register API
          </Button>
        ) : null}
      </div>

      {error ? <p role="alert" className="border border-critical/30 bg-critical/5 px-3 py-2 text-[12px] text-ink">{error}</p> : null}
      {loading ? <div className="flex min-h-36 items-center justify-center"><Spinner size="md" label="Loading workspace inventory" /></div> : null}

      {!loading && view === 'projects' ? (
        projects.filter((project) => project.status === 'active').length === 0 ? (
          <EmptyState icon={Boxes} title="No projects yet" description={isOwnerOrAdmin ? 'Create a project to group APIs and environments for this workspace.' : 'A workspace administrator can create projects for this workspace.'} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {activeProjects.map((project) => {
              const projectApis = apis.filter((api) => api.project_id === project.id && api.status === 'active');
              return (
                <article key={project.id} className="aegis-panel p-4" aria-label={`Project ${project.name}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-canvas text-forest"><Boxes size={17} aria-hidden="true" /></span>
                      <div className="min-w-0">
                        <h3 className="m-0 truncate font-display text-[14px] font-semibold text-ink">{project.name}</h3>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{project.slug}</p>
                      </div>
                    </div>
                    {isOwnerOrAdmin ? <button type="button" className="rounded p-2 text-muted hover:bg-canvas hover:text-ink" aria-label={`Archive project ${project.name}`} title="Archive project" onClick={() => void archiveProject(project)}><Archive size={15} /></button> : null}
                  </div>
                  {project.description ? <p className="mt-3 text-[12px] leading-relaxed text-muted">{project.description}</p> : null}
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">Registered APIs</span>
                    <Badge variant="neutral">{projectApis.length}</Badge>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {!loading && view === 'apis' ? (
        activeProjects.length === 0 ? (
          <EmptyState icon={Boxes} title="Create a project first" description="APIs are always registered under a workspace project." />
        ) : apis.filter((api) => api.status === 'active').length === 0 ? (
          <EmptyState icon={Globe2} title="No APIs registered" description="Register an API to add its provider, project, and environment to the shared inventory." />
        ) : (
          <div className="aegis-panel overflow-x-auto">
            <table className="aegis-table w-full text-left">
              <thead><tr><th scope="col">API</th><th scope="col">Project</th><th scope="col">Environment</th><th scope="col">Provider / category</th><th scope="col">Assessment</th><th scope="col" className="text-right">Actions</th></tr></thead>
              <tbody>
                {apis.filter((api) => api.status === 'active').map((api) => (
                  <tr key={api.id}>
                    <td className="min-w-[240px]">
                      <div className="flex items-start gap-2.5"><Globe2 size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" /><div><p className="m-0 font-medium text-ink">{api.name}</p><p className="mt-1 max-w-[320px] truncate font-mono text-[9.5px] text-muted">{api.base_url}</p></div></div>
                    </td>
                    <td>{projectNameById.get(api.project_id) || '—'}</td>
                    <td><Badge variant={api.environment === 'production' ? 'warning' : 'neutral'}>{api.environment === 'custom' ? api.custom_environment || 'custom' : api.environment}</Badge></td>
                    <td className="text-muted">{[api.provider, api.category].filter(Boolean).join(' · ') || '—'}</td>
                    <td><span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase text-muted"><Server size={12} aria-hidden="true" />No scan linked</span></td>
                    <td className="text-right">{isOwnerOrAdmin || api.created_by === user?.id ? <button type="button" className="rounded p-2 text-muted hover:bg-canvas hover:text-ink" aria-label={`Archive API ${api.name}`} title="Archive API" onClick={() => void archiveApi(api)}><Archive size={15} /></button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <Modal isOpen={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} title="Create project" description="Group related APIs in this workspace.">
        <form className="space-y-4" onSubmit={(event) => void handleCreateProject(event)}>
          <div><label htmlFor="workspace-project-name" className="aegis-label mb-1.5 block">Project name</label><input id="workspace-project-name" autoFocus required maxLength={160} value={projectName} onChange={(event) => setProjectName(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[13px] text-ink outline-none focus:border-forest" /></div>
          <div><label htmlFor="workspace-project-description" className="aegis-label mb-1.5 block">Description</label><textarea id="workspace-project-description" maxLength={2000} rows={3} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} className="w-full border border-line-strong bg-canvas px-3 py-2 text-[12px] text-ink outline-none focus:border-forest" /></div>
          <div className="flex justify-end gap-2 border-t border-line pt-3"><Button variant="ghost" size="sm" onClick={() => setProjectDialogOpen(false)}>Cancel</Button><Button variant="primary" size="sm" type="submit" isLoading={submitting} disabled={submitting}>Create project</Button></div>
        </form>
      </Modal>

      <Modal isOpen={apiDialogOpen} onClose={() => setApiDialogOpen(false)} title="Register API" description="Store API metadata only. Do not enter credentials or tokens.">
        <form className="space-y-4" onSubmit={(event) => void handleCreateApi(event)}>
          <div><label htmlFor="workspace-api-project" className="aegis-label mb-1.5 block">Project</label><select id="workspace-api-project" required value={apiProjectId} onChange={(event) => setApiProjectId(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12px] text-ink outline-none focus:border-forest">{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
          <div><label htmlFor="workspace-api-name" className="aegis-label mb-1.5 block">API name</label><input id="workspace-api-name" autoFocus required maxLength={180} value={apiName} onChange={(event) => setApiName(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[13px] text-ink outline-none focus:border-forest" /></div>
          <div><label htmlFor="workspace-api-url" className="aegis-label mb-1.5 block">Base URL</label><input id="workspace-api-url" type="url" required maxLength={2048} placeholder="https://api.example.com/v1" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 font-mono text-[11px] text-ink outline-none focus:border-forest" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="workspace-api-provider" className="aegis-label mb-1.5 block">Provider</label><input id="workspace-api-provider" maxLength={120} value={apiProvider} onChange={(event) => setApiProvider(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12px] text-ink outline-none focus:border-forest" /></div><div><label htmlFor="workspace-api-category" className="aegis-label mb-1.5 block">Category</label><input id="workspace-api-category" maxLength={120} value={apiCategory} onChange={(event) => setApiCategory(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12px] text-ink outline-none focus:border-forest" /></div></div>
          <div><label htmlFor="workspace-api-environment" className="aegis-label mb-1.5 block">Environment</label><select id="workspace-api-environment" value={apiEnvironment} onChange={(event) => setApiEnvironment(event.target.value as WorkspaceEnvironment)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12px] text-ink outline-none focus:border-forest">{environments.map((environment) => <option key={environment} value={environment}>{environment}</option>)}</select></div>
          {apiEnvironment === 'custom' ? <div><label htmlFor="workspace-api-custom-environment" className="aegis-label mb-1.5 block">Custom environment name</label><input id="workspace-api-custom-environment" required maxLength={80} value={customEnvironment} onChange={(event) => setCustomEnvironment(event.target.value)} className="min-h-11 w-full border border-line-strong bg-canvas px-3 text-[12px] text-ink outline-none focus:border-forest" /></div> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-3"><Button variant="ghost" size="sm" onClick={() => setApiDialogOpen(false)}>Cancel</Button><Button variant="primary" size="sm" type="submit" isLoading={submitting} disabled={submitting || !apiProjectId}>Register API</Button></div>
        </form>
      </Modal>
    </section>
  );
}
