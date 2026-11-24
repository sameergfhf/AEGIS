import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Scan,
  AlertCircle,
  Globe,
  ArrowRight,
  Search,
  User,
  Users,
  RefreshCw,
  History,
  FileCode2,
  Activity,
  CheckCircle2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useScan } from '../hooks/useScan';
import { getScanHistory } from '../services/api';
import type { ScanSummary } from '../types';
import { Button, Badge, SeverityBadge } from '../components/ui';
import { parseApiTimestamp } from '../lib/dateTime';

const SAMPLE_PRESETS = [
  { label: 'GitHub', url: 'https://api.github.com' },
  { label: 'Stripe', url: 'https://api.stripe.com/v1/charges' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'HTTPBin', url: 'https://httpbin.org/get' },
];

function formatStarted(value?: string) {
  if (!value) return '—';
  const date = parseApiTimestamp(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function scoreTone(score?: number | null) {
  if (score === undefined || score === null) return { text: 'text-muted', grade: '—', bar: '#6B7280' };
  if (score >= 90) return { text: 'text-safe', grade: 'A+', bar: '#10B981' };
  if (score >= 75) return { text: 'text-info', grade: 'B', bar: '#3B82F6' };
  if (score >= 50) return { text: 'text-medium', grade: 'C', bar: '#F59E0B' };
  return { text: 'text-critical', grade: 'F', bar: '#EF4444' };
}

const statusTone: Record<string, string> = {
  completed: 'bg-safe',
  running: 'bg-forest',
  pending: 'bg-medium',
  failed: 'bg-critical',
  cancelled: 'bg-muted',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { isLoading, error, startScan, scan } = useScan();
  const [url, setUrl] = useState('');
  const [scanScope, setScanScope] = useState<'workspace' | 'personal'>('workspace');
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadRecentScans = useCallback(() => {
    setHistoryState('loading');
    getScanHistory(10, 0, 'workspace', currentWorkspace?.id)
      .then((r) => {
        setRecentScans(r.scans);
        setTotalScans(r.total);
        setHistoryState('ready');
      })
      .catch(() => setHistoryState('error'));
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadRecentScans();
  }, [loadRecentScans]);

  useEffect(() => {
    if (scan?.status === 'completed') navigate(`/scan/${scan.id}`);
  }, [scan, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return toast.error('Please enter an API URL to scan.');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return toast.error('URL must begin with http:// or https://');
    }
    const targetWorkspaceId = user && scanScope === 'workspace' ? currentWorkspace?.id : null;
    await startScan(trimmed, undefined, targetWorkspaceId);
  };

  const completedScans = recentScans.filter(
    (s) => s.assessment_score !== undefined && s.assessment_score !== null,
  );
  const avgScore =
    completedScans.length > 0
      ? completedScans.reduce((acc, s) => acc + (s.assessment_score ?? 0), 0) / completedScans.length
      : null;
  const passedScans = completedScans.filter((s) => (s.assessment_score ?? 0) >= 75).length;
  const criticalExposures = completedScans.filter((s) => (s.assessment_score ?? 0) < 50).length;
  const filteredRecentScans = recentScans.filter(
    (s) =>
      !searchQuery ||
      s.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const watching = scan?.status === 'running' || scan?.status === 'pending';

  const metrics = [
    {
      label: 'Assessments',
      value: totalScans,
      note: 'Saved in this workspace',
      icon: History,
      color: 'var(--aegis-accent)',
      bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.2)',
    },
    {
      label: 'Avg Score',
      value: avgScore !== null ? `${avgScore.toFixed(0)}` : '—',
      note: 'Across completed scans',
      icon: TrendingUp,
      color: avgScore !== null && avgScore >= 75 ? '#10B981' : avgScore !== null && avgScore >= 50 ? '#F59E0B' : '#6B7280',
      bg: 'rgba(99,102,241,0.08)',
      border: 'rgba(99,102,241,0.2)',
    },
    {
      label: 'Healthy',
      value: passedScans,
      note: 'Score of 75 or higher',
      icon: Shield,
      color: '#10B981',
      bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.2)',
    },
    {
      label: 'Needs Review',
      value: criticalExposures,
      note: 'Score below 50',
      icon: AlertCircle,
      color: criticalExposures > 0 ? '#EF4444' : '#6B7280',
      bg: criticalExposures > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(107,114,128,0.08)',
      border: criticalExposures > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(107,114,128,0.2)',
    },
  ];

  return (
    <div className="aegis-container pb-16 page-dashboard">
      {/* Page Header */}
      <header className="dash-heading">
        <div className="dash-heading-info">
          <div className="dash-kicker-badge">
            <span className="dash-kicker-dot" />
            <span className="dash-kicker-text">SECURITY OVERVIEW</span>
            <span className="dash-slash">/</span>
            <span className="dash-kicker-scope">{currentWorkspace?.name ?? 'Personal workspace'}</span>
          </div>
          <h1 className="dash-heading-title">Know where your APIs stand.</h1>
          <p className="dash-heading-subtitle">Run an evidence-led security review and see what needs attention first.</p>
        </div>
        <div className="dash-heading-actions">
          <Button variant="secondary" size="md" onClick={() => navigate('/history')} leftIcon={<History size={16} />}>View history</Button>
          <Button variant="outline" size="md" onClick={() => navigate('/spec')} leftIcon={<FileCode2 size={16} />}>Import a spec</Button>
        </div>
      </header>

      {/* Metric Cards */}
      <section aria-label="Scan summary metrics" className="dash-metric-grid">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="dash-metric-card"
            style={{ '--metric-color': metric.color, '--metric-bg': metric.bg, '--metric-border': metric.border } as React.CSSProperties}
          >
            <div className="dash-metric-card-icon" style={{ background: metric.bg, color: metric.color }}>
              <metric.icon size={20} />
            </div>
            <div className="dash-metric-card-body">
              <span className="dash-metric-card-label">{metric.label}</span>
              <strong className="dash-metric-card-value" style={{ color: metric.color }}>{metric.value}</strong>
              <span className="dash-metric-card-note">{metric.note}</span>
            </div>
          </article>
        ))}
      </section>

      {/* Scan Workbench + Method Card */}
      <section className="dash-workbench" aria-label="Start a security assessment">
        <div className="dash-scan-card">
          <div className="dash-scan-topline">
            <div className="dash-scan-symbol"><Scan size={20} /></div>
            <Badge variant="success" size="xs"><Shield size={12} /> Safe, read-only probes</Badge>
          </div>
          <p className="dash-overline">START A NEW ASSESSMENT</p>
          <h2>What should we check?</h2>
          <p className="dash-scan-description">Enter a public API endpoint. AEGIS checks transport, response policy, data exposure, and reputation.</p>
          <form onSubmit={handleSubmit} className="dash-scan-form">
            {user && (
              <div className="dash-scope-row">
                <span className="dash-scope-label">Save results to</span>
                <div role="group" aria-label="Scan retention scope" className="dash-scope-switch">
                  <button
                    type="button"
                    className={`dash-scope-btn ${scanScope === 'workspace' ? 'is-active' : ''}`}
                    aria-pressed={scanScope === 'workspace'}
                    onClick={() => setScanScope('workspace')}
                  >
                    <Users size={14} />
                    <span>Workspace</span>
                  </button>
                  <button
                    type="button"
                    className={`dash-scope-btn ${scanScope === 'personal' ? 'is-active' : ''}`}
                    aria-pressed={scanScope === 'personal'}
                    onClick={() => setScanScope('personal')}
                  >
                    <User size={14} />
                    <span>Personal</span>
                  </button>
                </div>
              </div>
            )}
            <div className="dash-url-row"><div className="dash-url-field"><Globe size={18} /><label htmlFor="api-url-input" className="sr-only">Target API URL</label><input id="api-url-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/v1" disabled={isLoading || watching} /></div><Button id="start-scan-btn" type="submit" variant="primary" disabled={!url.trim() || isLoading || watching} isLoading={isLoading || watching} leftIcon={<Scan size={16} />}>{watching ? 'Checking…' : 'Run assessment'}</Button></div>
            <div className="dash-presets"><span>TRY AN EXAMPLE</span>{SAMPLE_PRESETS.map((preset) => <button key={preset.url} type="button" onClick={() => setUrl(preset.url)} disabled={isLoading || watching}>{preset.label}</button>)}</div>
          </form>
          {watching && <div aria-live="polite" className="dash-live-state"><span className="aegis-live-dot aegis-live-dot--pulse" /> Assessment running <code>{scan?.url}</code></div>}
          {error && <div role="alert" className="dash-error"><AlertCircle size={16} />{error}</div>}
          <div className="dash-promise"><Shield size={14} /><span>Probes are read-only. Destructive methods require explicit confirmation in Operation Scan.</span></div>
        </div>
        <aside className="dash-method-card">
          <div className="dash-method-header">
            <div>
              <p className="dash-overline">THE AEGIS METHOD</p>
              <h3>Four signals. One clear picture.</h3>
            </div>
            <span className="dash-method-icon"><Shield size={19} /></span>
          </div>
          <div className="dash-method-list">
            {[
              ['01', 'Transport security', 'TLS versions, certificates, cipher strength'],
              ['02', 'Response policy', 'HSTS, CSP, CORS, and browser protections'],
              ['03', 'Data exposure', 'Server details, error messages, and secrets'],
              ['04', 'Threat reputation', 'Domain intelligence and known risk signals'],
            ].map(([n, title, detail]) => (
              <div className="dash-method-row" key={n}>
                <span className="dash-method-num">{n}</span>
                <div className="dash-method-text">
                  <strong className="dash-method-title">{title}</strong>
                  <span className="dash-method-desc">{detail}</span>
                </div>
                <CheckCircle2 size={16} className="dash-method-check shrink-0 text-safe" />
              </div>
            ))}
          </div>
          <p className="dash-method-foot">Every score links back to an observed result.</p>
        </aside>
      </section>

      {/* Quick Stats Row */}
      {completedScans.length > 0 && (
        <section className="dash-quick-stats" aria-label="Quick stats">
          <div className="dash-qs-item">
            <Zap size={14} className="text-forest" />
            <span><strong>{completedScans.length}</strong> scored</span>
          </div>
          <div className="dash-qs-sep" />
          <div className="dash-qs-item">
            <Activity size={14} className="text-info" />
            <span>Avg <strong>{avgScore?.toFixed(0) ?? '—'}</strong> / 100</span>
          </div>
          <div className="dash-qs-sep" />
          <div className="dash-qs-item">
            <Shield size={14} className="text-safe" />
            <span><strong>{passedScans}</strong> passing</span>
          </div>
          {criticalExposures > 0 && (
            <>
              <div className="dash-qs-sep" />
              <div className="dash-qs-item">
                <AlertCircle size={14} className="text-critical" />
                <span><strong>{criticalExposures}</strong> critical</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* Recent Scans */}
      <section className="dash-recent-section">
        <div className="dash-recent-heading">
          <div>
            <p className="dash-overline">YOUR LATEST ACTIVITY</p>
            <h2>Recent assessments</h2>
          </div>
          <div className="dash-recent-tools">
            <label className="dash-search">
              <Search size={15} />
              <input aria-label="Filter recent scans" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search endpoints" />
            </label>
            {recentScans.length > 0 && <Button variant="ghost" size="sm" onClick={() => navigate('/history')} rightIcon={<ArrowRight size={15} />}>All activity</Button>}
          </div>
        </div>
        {historyState === 'error' ? (
          <div className="dash-state-box">
            <div><strong>We couldn't load your activity</strong><p>The scan history service did not respond.</p></div>
            <Button variant="secondary" size="sm" onClick={loadRecentScans} leftIcon={<RefreshCw size={14} />}>Try again</Button>
          </div>
        ) : historyState === 'loading' ? (
          <div className="dash-loading-list" aria-busy="true" aria-label="Loading recent scans">
            {[0, 1, 2].map((row) => <div key={row} className="skeleton h-16 w-full" />)}
          </div>
        ) : filteredRecentScans.length === 0 ? (
          <div className="dash-empty">
            <span><Shield size={22} /></span>
            <div>
              <strong>{searchQuery ? 'No matching endpoints' : 'Your first assessment starts here'}</strong>
              <p>{searchQuery ? `Nothing in your recent activity matches "${searchQuery}".` : 'Run an assessment above to start building a clear picture of your API security.'}</p>
            </div>
            {searchQuery
              ? <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>Clear search</Button>
              : <Button variant="secondary" size="sm" onClick={() => setUrl('https://api.github.com')}>Try an example</Button>
            }
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>ENDPOINT</th>
                  <th>ASSESSMENT</th>
                  <th>STATUS</th>
                  <th>DATE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecentScans.map((s) => {
                  const tone = scoreTone(s.assessment_score);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/scan/${s.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/scan/${s.id}`); }}
                    >
                      <td>
                        <strong>{s.hostname}</strong>
                        <small>{s.url}</small>
                      </td>
                      <td>
                        <div className="dash-score-cell">
                          <span className={`dash-score ${tone.text}`}>{s.assessment_score != null ? s.assessment_score.toFixed(0) : '—'}</span>
                          <span className="dash-grade">{tone.grade}</span>
                          {s.assessment_score != null && (
                            <div className="dash-score-bar-track">
                              <div
                                className="dash-score-bar-fill"
                                style={{ width: `${s.assessment_score}%`, background: tone.bar }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="dash-status">
                          <i className={statusTone[s.status] ?? 'bg-muted'} />
                          {s.status}
                          {s.highest_severity && <SeverityBadge severity={s.highest_severity} size="xs" />}
                        </span>
                      </td>
                      <td><time dateTime={s.started_at}>{formatStarted(s.started_at)}</time></td>
                      <td><ArrowRight size={16} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
