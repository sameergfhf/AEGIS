// src/pages/ScanHistory.tsx — Scan history with comparison

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, GitCompare, Search, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getScanHistory, compareScans } from '../services/api';
import type { ScanSummary, ComparisonResult } from '../types';
import toast from 'react-hot-toast';

function ScoreChange({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  if (change > 0) return <span className="text-green-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{change.toFixed(1)}</span>;
  if (change < 0) return <span className="text-red-400 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{change.toFixed(1)}</span>;
  return <span className="text-slate-400 flex items-center gap-0.5"><Minus className="w-3 h-3" />0</span>;
}

export default function ScanHistory() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    getScanHistory(50, 0)
      .then((r) => { setScans(r.scans); setTotal(r.total); })
      .catch(() => toast.error('Failed to load scan history'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = scans.filter((s) =>
    s.hostname.toLowerCase().includes(search.toLowerCase()) ||
    s.url.toLowerCase().includes(search.toLowerCase()),
  );

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
    } catch {
      toast.error('Comparison failed');
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          <h1 className="text-xl font-bold text-white">Scan History</h1>
          <span className="text-xs text-slate-500 ml-2">{total} total scans</span>
        </div>

        {selectedIds.length === 2 && (
          <button
            onClick={handleCompare}
            disabled={isComparing}
            id="compare-scans-btn"
            className="flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm px-4 py-2 rounded-lg hover:bg-purple-500/30 transition-all disabled:opacity-50"
          >
            {isComparing ? (
              <div className="w-4 h-4 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
            ) : (
              <GitCompare className="w-4 h-4" />
            )}
            Compare Selected
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by hostname or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700/50 text-white text-sm pl-9 pr-4 py-2 rounded-lg outline-none focus:border-cyan-500/50 placeholder-slate-500"
        />
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-slate-400 mb-3">
          {selectedIds.length}/2 scans selected for comparison
          {selectedIds.length === 1 && ' — select one more to compare'}
        </p>
      )}

      {/* Scans table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No scans found</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/60 text-slate-400 uppercase tracking-wide">
                <th className="w-8 px-4 py-3"></th>
                <th className="text-left px-4 py-3">Target</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">Coverage</th>
                <th className="text-left px-4 py-3">Highest Sev.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-slate-700/30 transition-colors ${
                    selectedIds.includes(s.id) ? 'bg-purple-500/5 border-purple-500/20' : i % 2 === 0 ? '' : 'bg-slate-800/10'
                  } hover:bg-slate-800/30`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="rounded border-slate-600 accent-purple-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-200 font-medium font-mono">{s.hostname}</p>
                    <p className="text-slate-500 mt-0.5 truncate max-w-xs">{s.url}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(s.started_at).toLocaleDateString()}
                    <br />
                    <span className="text-slate-500">{new Date(s.started_at).toLocaleTimeString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`capitalize px-2 py-0.5 rounded-full text-xs border ${
                      s.status === 'completed' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
                      s.status === 'failed' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.assessment_score !== undefined && s.assessment_score !== null ? (
                      <span className={`font-bold ${
                        s.assessment_score >= 80 ? 'text-green-400' :
                        s.assessment_score >= 60 ? 'text-yellow-400' :
                        s.assessment_score >= 40 ? 'text-orange-400' : 'text-red-400'
                      }`}>{s.assessment_score.toFixed(0)}</span>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {s.assessment_coverage !== undefined ? `${s.assessment_coverage.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {s.highest_severity ? (
                      <span className={`capitalize severity-${s.highest_severity} px-2 py-0.5 rounded-full border text-xs`}>
                        {s.highest_severity}
                      </span>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/scan/${s.id}`)}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comparison result */}
      {comparison && (
        <div className="mt-8 glass-card p-6 fade-in">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-purple-400" />
            Scan Comparison
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800/40 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Score Change</p>
              <div className="text-lg font-bold"><ScoreChange change={comparison.score_change} /></div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Coverage Change</p>
              <div className="text-lg font-bold"><ScoreChange change={comparison.coverage_change} /></div>
            </div>
            <div className="bg-slate-800/40 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Latency Change</p>
              <div className="text-lg font-bold">
                {comparison.latency_change_ms !== undefined && comparison.latency_change_ms !== null
                  ? `${comparison.latency_change_ms > 0 ? '+' : ''}${comparison.latency_change_ms.toFixed(0)}ms`
                  : '—'}
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {comparison.finding_changes.map((change, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-800/30 rounded-lg px-3 py-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full border text-xs flex-shrink-0 ${
                  change.status === 'new' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                  change.status === 'not_detected' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
                  change.status === 'severity_changed' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' :
                  'text-slate-400 bg-slate-700/40 border-slate-600/40'
                }`}>
                  {change.status === 'not_detected' ? 'not detected' : change.status.replace('_', ' ')}
                </span>
                <span className="text-slate-300 font-medium">{change.title}</span>
                <span className="text-slate-500">{change.category}</span>
                {change.severity_before && change.severity_after && change.severity_before !== change.severity_after && (
                  <span className="text-slate-400 ml-auto">
                    {change.severity_before} → {change.severity_after}
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-4 italic">{comparison.note}</p>
        </div>
      )}
    </div>
  );
}
