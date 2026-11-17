import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  addWorkspaceIncidentComment,
  createWorkspaceIncident,
  fetchWorkspaceIncidents,
  updateWorkspaceIncidentStatus,
} from '../../services/workspaceService';
import type { WorkspaceIncident } from '../../types';
import { Badge, Button, EmptyState, Spinner } from '../ui';

const statuses: WorkspaceIncident['status'][] = [
  'open', 'acknowledged', 'investigating', 'remediation_in_progress', 'resolved', 'closed', 'accepted_risk',
];
const labelize = (value: string) => value.replaceAll('_', ' ');

export default function WorkspaceIncidents() {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<WorkspaceIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<WorkspaceIncident['severity']>('high');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      setItems(await fetchWorkspaceIncidents(currentWorkspace.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load workspace incidents.');
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);
  useEffect(() => { void reload(); }, [reload]);

  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspaceIncident({ workspaceId: currentWorkspace.id, title, description, severity });
      setTitle(''); setDescription('');
      toast.success('Incident created.');
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create incident.');
    } finally { setSubmitting(false); }
  };

  const addNote = async (incident: WorkspaceIncident) => {
    if (!currentWorkspace) return;
    const body = notes[incident.id]?.trim();
    if (!body) return;
    try {
      await addWorkspaceIncidentComment(currentWorkspace.id, incident.id, body);
      setNotes((current) => ({ ...current, [incident.id]: '' }));
      toast.success('Investigation note added.');
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add investigation note.');
    }
  };

  if (!currentWorkspace) return <EmptyState icon={AlertTriangle} title="Select a workspace" description="Incidents are scoped to a workspace." />;
  return <section className="space-y-4" aria-label="Workspace incidents">
    <form onSubmit={(event) => void createIncident(event)} className="grid gap-3 border border-line bg-surface p-4 sm:grid-cols-2">
      <h2 className="m-0 font-display text-sm font-semibold text-ink sm:col-span-2">Create an incident</h2>
      <input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Incident title" placeholder="Incident title" className="aegis-input" />
      <select value={severity} onChange={(event) => setSeverity(event.target.value as WorkspaceIncident['severity'])} aria-label="Incident severity" className="aegis-input">{['info', 'low', 'medium', 'high', 'critical'].map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <textarea maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Incident description" placeholder="Description and initial evidence context" className="aegis-input min-h-20 sm:col-span-2" />
      <div className="sm:col-span-2"><Button type="submit" variant="primary" size="sm" disabled={submitting}>Create incident</Button></div>
    </form>
    {loading ? <div className="flex min-h-28 items-center justify-center"><Spinner size="md" label="Loading incidents" /></div>
      : items.length === 0 ? <EmptyState icon={AlertTriangle} title="No incidents" description="Workspace security incidents will appear here." />
      : items.map((incident) => <article key={incident.id} className="space-y-3 border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="m-0 text-sm font-semibold text-ink">{incident.title}</h3><Badge variant={incident.severity === 'critical' || incident.severity === 'high' ? 'critical' : 'default'}>{incident.severity}</Badge></div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{incident.description || 'No description recorded.'}</p>
            <p className="mt-1 text-[11px] text-muted">Created {new Date(incident.created_at).toLocaleString()}</p>
          </div>
          <select value={incident.status} aria-label={`Status for ${incident.title}`} onChange={(event) => void updateWorkspaceIncidentStatus(incident.id, event.target.value as WorkspaceIncident['status']).then(reload).catch((error) => toast.error(error.message))} className="aegis-input min-w-48">{statuses.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select>
        </div>
        <div className="flex flex-wrap gap-2"><input value={notes[incident.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [incident.id]: event.target.value }))} aria-label={`Investigation note for ${incident.title}`} placeholder="Add investigation note" className="aegis-input min-w-64 flex-1" /><Button variant="secondary" size="sm" onClick={() => void addNote(incident)}>Add note</Button></div>
      </article>)}
  </section>;
}
