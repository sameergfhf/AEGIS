import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bell, Play, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createScheduledScan, getScheduledScanExecutions, listScheduledScans, runScheduledScanNow, setScheduledScanEnabled } from '../../services/api';
import { fetchWorkspaceApis } from '../../services/workspaceService';
import type { ScheduledScanExecution, ScheduledWorkspaceScan, WorkspaceApi } from '../../types';
import { Badge, Button, EmptyState, Spinner } from '../ui';
import { formatApiTimestamp } from '../../lib/dateTime';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WorkspaceAutomation() {
  const { currentWorkspace } = useWorkspace();
  const [rows, setRows] = useState<ScheduledWorkspaceScan[]>([]);
  const [apis, setApis] = useState<WorkspaceApi[]>([]);
  const [apiId, setApiId] = useState('');
  const [runs, setRuns] = useState<Record<string, ScheduledScanExecution[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'interval'>('daily');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [localTime, setLocalTime] = useState('02:00');
  const [weekday, setWeekday] = useState(0);
  const [interval, setInterval] = useState(1440);

  const reload = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [schedules, inventory] = await Promise.all([listScheduledScans(currentWorkspace.id), fetchWorkspaceApis(currentWorkspace.id)]);
      setRows(schedules); setApis(inventory.filter((api) => api.status === 'active'));
      setApiId((current) => current || inventory.find((api) => api.status === 'active')?.id || '');

    }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load schedules.'); }
    finally { setLoading(false); }
  }, [currentWorkspace]);
  useEffect(() => { void reload(); }, [reload]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      if (!apiId) throw new Error('Register an active API in the workspace before scheduling scans.');
      await createScheduledScan({ workspace_id: currentWorkspace.id, api_id: apiId, name, url, cadence, timezone_name: timezone,
        local_time: localTime, ...(cadence === 'weekly' ? { weekday } : {}), ...(cadence === 'interval' ? { interval_minutes: interval } : {}) });
      toast.success('Scheduled scan saved.'); setName(''); await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save schedule.'); }
    finally { setSaving(false); }
  };

  const showRuns = async (id: string) => {
    try { const history = await getScheduledScanExecutions(id); setRuns((current) => ({ ...current, [id]: history })); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load execution history.'); }
  };


  if (!currentWorkspace) return <EmptyState icon={Bell} title="Select a workspace" description="Scheduled scans are owned by a workspace." />;
  return <section className="space-y-4" aria-label="Scheduled scans">
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <h2 className="m-0 font-display text-sm font-semibold text-ink sm:col-span-2 lg:col-span-4">Persistent scheduled scans</h2>
      <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} aria-label="Schedule name" placeholder="Schedule name" className="aegis-input" />
      <select required value={apiId} onChange={(event) => { const nextId = event.target.value; setApiId(nextId); const selected = apis.find((api) => api.id === nextId); if (selected) setUrl(selected.base_url); }} aria-label="Registered API" className="aegis-input"><option value="">Choose an active registered API</option>{apis.map((api) => <option key={api.id} value={api.id}>{api.name} · {api.environment}</option>)}</select>
      <input required type="url" maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Target URL" placeholder="https://api.example.com" className="aegis-input" />
      <select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)} aria-label="Scan cadence" className="aegis-input"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="interval">Custom interval</option></select>
      <input required maxLength={64} value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-label="Timezone" placeholder="Timezone (e.g. Asia/Calcutta)" className="aegis-input" />
      {cadence !== 'interval' ? <input type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} aria-label="Local run time" className="aegis-input" /> : null}
      {cadence === 'weekly' ? <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))} aria-label="Weekday" className="aegis-input">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select> : null}
      {cadence === 'interval' ? <input type="number" min={15} max={10080} value={interval} onChange={(event) => setInterval(Number(event.target.value))} aria-label="Interval minutes" className="aegis-input" /> : null}
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" variant="primary" size="sm" disabled={saving} leftIcon={<Plus className="h-3.5 w-3.5" />}>Add schedule</Button></div>
    </form>
    {loading ? <div className="flex min-h-28 items-center justify-center"><Spinner size="md" label="Loading scheduled scans" /></div> : rows.length === 0 ? <EmptyState icon={Bell} title="No scheduled scans" description="Schedules are stored in the backend database and survive application restarts. Use a persistent database volume in production." /> : rows.map((row) => <article key={row.id} className="space-y-3 border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="m-0 text-sm font-semibold text-ink">{row.name}</h3><Badge variant={row.enabled ? 'success' : 'default'}>{row.enabled ? 'Enabled' : 'Paused'}</Badge></div><p className="mt-1 mb-0 break-all text-xs text-muted">{row.url}</p><p className="mt-1 mb-0 text-xs text-muted">Next: {formatApiTimestamp(row.next_run_at)} · Last: {row.last_run_at ? formatApiTimestamp(row.last_run_at) : 'Never'}</p></div>
        <div className="flex gap-2"><Button variant="secondary" size="sm" leftIcon={<Play className="h-3 w-3" />} onClick={() => void runScheduledScanNow(row.id).then((result) => toast.success(`Scan started: ${result.scan_id}`)).catch((error) => toast.error(error.message))}>Run now</Button><Button variant="secondary" size="sm" onClick={() => void setScheduledScanEnabled(row.id, !row.enabled).then(reload).catch((error) => toast.error(error.message))}>{row.enabled ? 'Pause' : 'Enable'}</Button><Button variant="ghost" size="sm" leftIcon={<RefreshCw className="h-3 w-3" />} onClick={() => void showRuns(row.id)}>History</Button></div></div>
      {runs[row.id] ? <div className="space-y-2 border-t border-line pt-3">{runs[row.id].length ? runs[row.id].map((run) => <p key={run.id} className="m-0 text-xs text-muted"><Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'critical' : 'default'}>{run.status}</Badge> {formatApiTimestamp(run.started_at)} · scan {run.scan_id}{run.error ? ` · ${run.error}` : ''}</p>) : <p className="m-0 text-xs text-muted">No runs recorded yet.</p>}</div> : null}
    </article>)}
  </section>;
}
