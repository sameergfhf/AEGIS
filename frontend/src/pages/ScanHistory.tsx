// src/pages/ScanHistory.tsx — Elevated Security Audit Log & Delta Comparison
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  GitCompare,
  Search,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  X,
  User,
  Users,
  Shield,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getScanHistory, compareScans } from '../services/api';
import type { ScanSummary, ComparisonResult } from '../types';
import toast from 'react-hot-toast';

function ScoreChange({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  if (change > 0) {
    return (
      <span className="text-emerald-400 font-extrabold flex items-center justify-center gap-1 font-mono">
        <TrendingUp className="w-4 h-4" />+{change.toFixed(1)}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="text-red-400 font-extrabold flex items-center justify-center gap-1 font-mono">
        <TrendingDown className="w-4 h-4" />{change.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="text-slate-400 font-bold flex items-center justify-center gap-1 font-mono">
      <Minus className="w-3.5 h-3.5" />0.0
    </span>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return <span className="text-slate-500 font-mono">—</span>;
  let color = 'text-red-400 bg-red-500/10 border-red-500/20';
  if (score >= 90) color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  else if (score >= 70) color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
  else if (score >= 50) color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';

  return (
    <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs border ${color}`}>
      {score.toFixed(0)}/100
    </span>
  );
}

export default function ScanHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scope, setScope] = useState<'workspace' | 'my'>('workspace');
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [myTotal, setMyTotal] = useState(0);
  const [workspaceTotal, setWorkspaceTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isComparing, setIsComparing] = useState(false);

  const fetchScans = (currentScope: 'workspace' | 'my' = scope) => {
    setIsLoading(true);
    getScanHistory(50, 0, currentScope)
      .then((r) => {
        setScans(r.scans);
        setTotal(r.total);
        if (r.my_total !== undefined) setMyTotal(r.my_total);
        if (r.workspace_total !== undefined) setWorkspaceTotal(r.workspace_total);
      })
      .catch(() => toast.error('Failed to load scan history'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchScans(scope);
  }, [scope]);

  const filtered = scans.filter((s) => {
    const matchesSearch =
      s.hostname.toLowerCase().includes(search.toLowerCase()) ||
      s.url.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length !== 2) {
      toast.error('Select exactly 2 scans to compare');
      return;
    }
    setIsComparing(true);
    try {
      const result = await compareScans(selectedIds[0], selectedIds[1]);
      setComparison(result);
      toast.success('Delta analysis generated!');
    } catch {
      toast.error('Comparison calculation failed');
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Security Audit Logs</span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400 font-mono">{total} Total Probes</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-cyan-400" />
            Scan History &amp; Posture Tracking
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browse previous observable scans, monitor posture trends, or select any 2 scans to run delta comparisons.
          </p>
        </div>

        {/* Action button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-cyan-500/20 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          New Probe
        </button>
      </div>

      {/* ── Scope Toggle: My Scans vs Workspace / Team Scans ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 self-start sm:self-auto">
          <button
            onClick={() => setScope('workspace')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              scope === 'workspace'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Workspace / Team Scans</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              scope === 'workspace' ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {workspaceTotal || total}
            </span>
          </button>

          <button
            onClick={() => {
              if (!user) {
                toast('Sign in to view your private personal scans', { icon: '🔒' });
                return;
              }
              setScope('my');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              scope === 'my'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                : user
                ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                : 'text-slate-500 hover:text-slate-400 opacity-60'
            }`}
            title={user ? 'Filter scans created by your account' : 'Sign in to access personal scan filtering'}
          >
            <User className="w-3.5 h-3.5" />
            <span>My Scans</span>
            {user ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                scope === 'my' ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {myTotal}
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-normal">
                Sign In
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 px-2">
          {scope === 'my' ? (
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Isolated User View: Showing only probes created by your account</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-400">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Shared Team Audit Log: Showing all organization and public probe records</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Filters & Search Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by hostname, path, or URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-700/80 text-white text-xs sm:text-sm pl-9 pr-8 py-2.5 rounded-xl outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500 font-mono transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto text-xs">
          {[
            { id: 'all', label: 'All Scans' },
            { id: 'completed', label: 'Completed' },
            { id: 'failed', label: 'Failed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scans Data Table ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 glass-card rounded-2xl border border-slate-800">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400 font-medium">Loading telemetry audit logs…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 glass-card rounded-2xl border border-slate-800 p-8">
          <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No Matching Scans Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {search ? 'Try clearing your search query or changing filters.' : 'Launch a new scan to start tracking history.'}
          </p>
          {search && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="w-12 px-4 py-3.5 text-center">Compare</th>
                  <th className="px-4 py-3.5">Target Host &amp; Endpoint</th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Execution Status</th>
                  <th className="px-4 py-3.5">Posture Score</th>
                  <th className="px-4 py-3.5">Coverage</th>
                  <th className="px-4 py-3.5">Highest Severity</th>
                  <th className="px-4 py-3.5">Owner / Origin</th>
                  <th className="w-16 px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map((s, idx) => {
                  const isSelected = selectedIds.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : idx % 2 === 0
                          ? 'hover:bg-slate-800/40'
                          : 'bg-slate-950/20 hover:bg-slate-800/40'
                      }`}
                      onClick={() => toggleSelect(s.id)}
                    >
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(s.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/20 cursor-pointer accent-cyan-500"
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-mono font-bold text-white text-xs truncate max-w-xs">{s.hostname}</p>
                        <p className="font-mono text-[11px] text-slate-400 truncate max-w-sm">{s.url}</p>
                      </td>

                      <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{new Date(s.started_at).toLocaleDateString()}</span>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            s.status === 'completed'
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                              : s.status === 'failed'
                              ? 'text-red-400 bg-red-500/10 border-red-500/20'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            s.status === 'completed' ? 'bg-emerald-400' :
                            s.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'
                          }`} />
                          <span className="capitalize">{s.status}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <ScoreBadge score={s.assessment_score} />
                      </td>

                      <td className="px-4 py-3.5 text-slate-400 font-mono">
                        {s.assessment_coverage !== undefined ? `${s.assessment_coverage.toFixed(0)}%` : '—'}
                      </td>

                      <td className="px-4 py-3.5">
                        {s.highest_severity ? (
                          <span className={`capitalize severity-${s.highest_severity} px-2 py-0.5 rounded-full border text-[11px] font-semibold`}>
                            {s.highest_severity}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {s.user_id && user && s.user_id === user.id ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                            <User className="w-2.5 h-2.5" />
                            My Scan
                          </span>
                        ) : s.user_email ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/90 text-slate-300 border border-slate-700">
                            <Users className="w-2.5 h-2.5 text-slate-500" />
                            <span className="max-w-[100px] truncate">{s.user_email.split('@')[0]}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Public / Guest
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/scan/${s.id}`)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Open full assessment"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sticky Comparison Floating Toolbar ───────────────────────────────── */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 animate-float">
          <div className="glass-card border border-cyan-500/40 bg-slate-950/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl shadow-cyan-950/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <GitCompare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {selectedIds.length}/2 Scans Selected
                </p>
                <p className="text-[11px] text-slate-400">
                  {selectedIds.length === 1 ? 'Select one more scan to run comparison' : 'Ready to analyze posture deltas'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleCompare}
                disabled={selectedIds.length !== 2 || isComparing}
                className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isComparing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <GitCompare className="w-3.5 h-3.5" />
                    Compare Scans
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Comparison Results Panel ─────────────────────────────────────────── */}
      {comparison && (
        <div className="glass-card border border-cyan-500/30 rounded-2xl p-6 sm:p-8 space-y-6 fade-in shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <GitCompare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Posture Delta Analysis</h2>
                <p className="text-xs text-slate-400">
                  Comparing Baseline ({comparison.scan_a?.id.slice(0, 8) ?? 'A'}…) vs Target ({comparison.scan_b?.id.slice(0, 8) ?? 'B'}…)
                </p>
              </div>
            </div>
            <button
              onClick={() => setComparison(null)}
              className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Delta KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Score Differential
              </span>
              <div className="text-xl font-extrabold">
                <ScoreChange change={comparison.score_change} />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Coverage Differential
              </span>
              <div className="text-xl font-extrabold">
                <ScoreChange change={comparison.coverage_change} />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Latency Variance
              </span>
              <div className="text-xl font-extrabold font-mono text-cyan-400">
                {comparison.latency_change_ms !== undefined && comparison.latency_change_ms !== null
                  ? `${comparison.latency_change_ms > 0 ? '+' : ''}${comparison.latency_change_ms.toFixed(0)}ms`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Findings Diff Breakdown */}
          {(() => {
            const newFindings = comparison.finding_changes?.filter((f) => f.status === 'new') ?? [];
            const resolvedFindings = comparison.finding_changes?.filter((f) => f.status === 'not_detected') ?? [];

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-2">
                    <XCircle className="w-4 h-4" />
                    New Vulnerabilities Disclosed ({newFindings.length})
                  </div>
                  {newFindings.length === 0 ? (
                    <p className="text-xs text-slate-500">Zero new regressions introduced.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {newFindings.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          <span>{f.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Remediated Findings ({resolvedFindings.length})
                  </div>
                  {resolvedFindings.length === 0 ? (
                    <p className="text-xs text-slate-500">No previous findings resolved.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {resolvedFindings.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{f.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
