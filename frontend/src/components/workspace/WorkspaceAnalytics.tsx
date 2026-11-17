import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getWorkspaceAnalytics } from '../../services/api';
import type { WorkspaceAnalyticsData } from '../../types';
import { Badge, Button, EmptyState, Spinner } from '../ui';

export default function WorkspaceAnalytics() {
  const { currentWorkspace } = useWorkspace();
  const [data, setData] = useState<WorkspaceAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [severity, setSeverity] = useState('');
  const [scanStatus, setScanStatus] = useState('');
  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      setData(await getWorkspaceAnalytics(currentWorkspace.id, {
        ...(from ? { date_from: `${from}T00:00:00.000Z` } : {}),
        ...(to ? { date_to: `${to}T23:59:59.999Z` } : {}),
        ...(severity ? { severity } : {}), ...(scanStatus ? { scan_status: scanStatus } : {}),
      }));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load workspace analytics.'); }
    finally { setLoading(false); }
  }, [currentWorkspace, from, to, severity, scanStatus]);
  useEffect(() => { void load(); }, [load]);

  if (!currentWorkspace) return <EmptyState icon={BarChart3} title="Select a workspace" description="Analytics use data visible to workspace members." />;
  if (loading && !data) return <div className="flex min-h-40 items-center justify-center"><Spinner size="md" label="Loading workspace analytics" /></div>;
  if (data && !data.scans.total && !data.apis.total && !data.incidents.open) return <EmptyState icon={BarChart3} title="No workspace data yet" description="Run workspace scans and register APIs to populate this dashboard." />;
  const metrics = [
    ['Registered APIs', data?.apis.total ?? '—'], ['Completed scans', data?.scans.completed ?? '—'],
    ['Failed scans', data?.scans.failed ?? '—'], ['Average security score', data?.scans.average_score == null ? 'Unassessed' : `${data.scans.average_score.toFixed(1)}/100`],
    ['Average assessment coverage', data?.scans.average_coverage == null ? 'Unassessed' : `${data.scans.average_coverage.toFixed(1)}%`],
    ['High and critical findings', (data?.findings.by_severity.high || 0) + (data?.findings.by_severity.critical || 0)],
    ['Open incidents', data?.incidents.open ?? '—'], ['Overdue incidents', data?.incidents.overdue ?? '—'],
    ['Scheduled scan success', data?.automation.success_rate == null ? 'No scheduled runs' : `${(data.automation.success_rate * 100).toFixed(0)}%`],
    ['Approved risk acceptances', data?.risk_acceptances.approved ?? '—'],
  ];
  return <section aria-label="Workspace analytics" className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
      <label className="aegis-label">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="aegis-input mt-1 block" /></label>
      <label className="aegis-label">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="aegis-input mt-1 block" /></label>
      <label className="aegis-label">Finding severity<select value={severity} onChange={(event) => setSeverity(event.target.value)} className="aegis-input mt-1 block"><option value="">All</option>{['critical', 'high', 'medium', 'low', 'informational'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="aegis-label">Scan status<select value={scanStatus} onChange={(event) => setScanStatus(event.target.value)} className="aegis-input mt-1 block"><option value="">All</option>{['completed', 'failed', 'running', 'pending'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>Refresh</Button>
    </div>
    <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="bg-surface p-4"><p className="m-0 text-xs text-muted">{label}</p><p className="mt-2 mb-0 font-display text-xl font-semibold text-ink">{value}</p></div>)}</div>
    <div className="border border-line bg-surface p-4"><div className="flex items-center justify-between"><h2 className="m-0 font-display text-sm font-semibold text-ink">Security score trend</h2><Badge variant="default">Score and coverage shown</Badge></div>{data?.scans.trend.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.scans.trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="average_score" stroke="var(--color-forest, #2b6b58)" name="Average score" connectNulls /><Line type="monotone" dataKey="average_coverage" stroke="#d97706" name="Assessment coverage" connectNulls /></LineChart></ResponsiveContainer></div> : <p className="mt-3 mb-0 text-sm text-muted">No completed scan scores in this date range.</p>}</div>
    <div className="border border-line bg-surface p-4"><h2 className="m-0 font-display text-sm font-semibold text-ink">Policy alignment</h2><p className="mt-2 mb-0 text-sm text-muted">{data?.policy.compliance_rate == null ? 'No conclusive policy assessments yet.' : `${(data.policy.compliance_rate * 100).toFixed(1)}% compliant`} · {data?.policy.inconclusive ?? 0} inconclusive · technical control assessment, not certification.</p></div>
    {data?.data_limitations.map((limitation) => <p key={limitation} className="m-0 text-xs text-muted">{limitation}</p>)}
  </section>;
}
