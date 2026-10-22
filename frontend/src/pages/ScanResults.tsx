// src/pages/ScanResults.tsx — Enhanced security scan evaluation view
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Download,
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
  LogIn,
  Search,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useScan } from '../hooks/useScan';
import { getReportUrl, createScan } from '../services/api';
import ScoreCard from '../components/ScoreCard';
import TestResultCard from '../components/TestResultCard';
import LatencyChart from '../components/LatencyChart';
import FlowDiagram from '../components/FlowDiagram';
import FindingsChart from '../components/FindingsChart';
import RequestInspector from '../components/RequestInspector';

const TEST_ORDER = ['tls', 'headers', 'leakage', 'reputation'] as const;

export default function ScanResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { scan, findings, visualizations, isLoading, isPolling, error, loadScan } = useScan();

  const [findingSearch, setFindingSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);

  useEffect(() => {
    if (scanId) {
      loadScan(scanId);
    }
  }, [scanId, loadScan]);

  const handleRescan = async () => {
    if (!scan?.url) return;
    try {
      setIsRescanning(true);
      toast.loading('Dispatching new audit for target…', { id: 'rescan' });
      const newScan = await createScan(scan.url, 'Re-scan triggered from results page');
      toast.success('New scan initiated!', { id: 'rescan' });
      navigate(`/scan/${newScan.id}`);
    } catch {
      toast.error('Failed to trigger re-scan', { id: 'rescan' });
    } finally {
      setIsRescanning(false);
    }
  };

  if (isLoading && !scan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 rounded-2xl border border-slate-800 flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm font-medium text-white">Loading Security Telemetry…</p>
          <p className="text-xs text-slate-500">Retrieving scan metrics, findings, and diagrams</p>
        </div>
      </div>
    );
  }

  if (error && !scan) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="glass-card p-8 text-center max-w-md border border-red-500/30 rounded-2xl">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Error Loading Scan</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => navigate(session ? '/dashboard' : '/')}
            className="px-4 py-2 rounded-xl bg-slate-800 text-cyan-400 hover:text-cyan-300 text-xs font-semibold border border-slate-700 cursor-pointer"
          >
            ← {session ? 'Back to Dashboard' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  if (!scan) return null;

  // Parse test results from result_json
  let testResults: Record<string, import('../types').TestResult> = {};
  try {
    if (scan.result_json) {
      const data = JSON.parse(scan.result_json);
      testResults = data.test_results ?? {};
    }
  } catch { /* ignore */ }

  const isRunning = scan.status === 'pending' || scan.status === 'running';
  const isFailed = scan.status === 'failed';

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    const matchesSearch =
      !findingSearch ||
      f.title.toLowerCase().includes(findingSearch.toLowerCase()) ||
      (f.description ?? '').toLowerCase().includes(findingSearch.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || f.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-6">
      {/* ── Guest Mode Banner ──────────────────────────────────────────────── */}
      {!session && (
        <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-lg shadow-cyan-950/40">
          <div className="flex items-center gap-2.5 text-cyan-200">
            <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>
              You are viewing this assessment in <strong>Guest Mode</strong>.
            </span>
          </div>
          <Link
            to="/auth"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold transition-all shadow-md shadow-cyan-500/20"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in to save scan to history
          </Link>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <button
            onClick={() => navigate(session ? '/dashboard' : '/')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-400 mb-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{session ? 'Back to Dashboard' : 'Back to Homepage'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white font-mono tracking-tight">
              {scan.hostname}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono">
              HTTPS
            </span>
            {scan.duration_ms && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                <Clock className="w-3 h-3 text-slate-500" />
                {(scan.duration_ms / 1000).toFixed(2)}s probe
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1 truncate max-w-xl">{scan.url}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isPolling && (
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 rounded-xl">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Scanning Target…
            </div>
          )}

          {scan.status === 'completed' && (
            <>
              <button
                onClick={handleRescan}
                disabled={isRescanning}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition-all cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-cyan-400' : ''}`} />
                Re-scan
              </button>

              <a
                href={getReportUrl(scan.id)}
                download
                id="download-report-btn"
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                onClick={() => toast.success('Downloading compliance-ready PDF report…')}
              >
                <Download className="w-4 h-4" />
                Export PDF Report
              </a>
            </>
          )}
        </div>
      </div>

      {/* ── Scanning State Banner ────────────────────────────────────────────── */}
      {isRunning && (
        <div className="glass-card p-6 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin flex-shrink-0" />
          <div>
            <p className="text-white font-bold text-sm">Security Audit in Progress</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Executing TLS handshakes, security header audits, information leak detection, and threat intel lookups…
            </p>
          </div>
        </div>
      )}

      {/* ── Failed State Banner ──────────────────────────────────────────────── */}
      {isFailed && (
        <div className="glass-card p-6 rounded-2xl border-red-500/30 bg-red-950/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white font-bold text-sm">Audit Failed</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {scan.error_message || 'The target host could not be audited or rejected connection.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Completed Results Dashboard ──────────────────────────────────────── */}
      {scan.status === 'completed' && (
        <div className="space-y-8">
          {/* Top Row: Score Ring Card & Sanitized Request Inspector */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ScoreCard scan={scan} />
            <RequestInspector scan={scan} />
          </div>

          {/* Test Pillars Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Four Security Vector Evaluations
              </h2>
              <span className="text-[11px] text-slate-500">Click card to expand findings &amp; evidence</span>
            </div>
            <div className="space-y-3">
              {TEST_ORDER.map((key) =>
                testResults[key] ? (
                  <TestResultCard key={key} testKey={key} result={testResults[key]} />
                ) : null,
              )}
            </div>
          </div>

          {/* Visual Intelligence Engine Charts */}
          {visualizations && (
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Visual Intelligence Telemetry
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <LatencyChart latency={visualizations.latency} />
                <FindingsChart
                  findingsBySeverity={visualizations.findings_by_severity}
                  findings={findings}
                />
              </div>

              {/* Full Width Flow Diagram */}
              <div className="space-y-2">
                <FlowDiagram flow={visualizations.flow} />
              </div>
            </div>
          )}

          {/* Detailed Findings Table with Filters */}
          {findings.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Disclosed Findings &amp; Remediation Advisory
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {findings.length} total findings identified across all vectors
                  </p>
                </div>

                {/* Severity Filter Chips */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {['all', 'critical', 'high', 'medium', 'low', 'informational'].map((sev) => {
                    const count = sev === 'all' ? findings.length : findings.filter((f) => f.severity === sev).length;
                    if (sev !== 'all' && count === 0) return null;
                    return (
                      <button
                        key={sev}
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          severityFilter === sev
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {sev} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table */}
              <div className="glass-card border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-3 border-b border-slate-800 bg-slate-900/60">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search findings by title or keyword…"
                      value={findingSearch}
                      onChange={(e) => setFindingSearch(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-700/60 text-white text-xs pl-8 pr-4 py-1.5 rounded-lg outline-none focus:border-cyan-500/50 placeholder-slate-500 font-mono"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {filteredFindings.map((f) => {
                    const isExpanded = expandedFindingId === f.id;
                    return (
                      <div key={f.id} className="p-4 hover:bg-slate-850/40 transition-colors">
                        <div
                          className="flex items-start justify-between gap-3 cursor-pointer"
                          onClick={() => setExpandedFindingId(isExpanded ? null : f.id)}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className={`capitalize severity-${f.severity} text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 flex-shrink-0`}>
                              {f.severity}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-white hover:text-cyan-300 transition-colors">
                                {f.title}
                              </p>
                              {f.description && (
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                  {f.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-slate-500 hover:text-slate-300 ml-2 flex-shrink-0">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>

                        {/* Expandable Remediation Panel */}
                        {isExpanded && (
                          <div className="mt-4 pt-3 border-t border-slate-800/70 space-y-3 text-xs fade-in">
                            {f.why_it_matters && (
                              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-200">
                                <span className="font-bold uppercase tracking-wider text-[10px] block mb-1">Why It Matters</span>
                                <p className="leading-relaxed">{f.why_it_matters}</p>
                              </div>
                            )}

                            {f.remediation && (
                              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-200">
                                <span className="font-bold uppercase tracking-wider text-[10px] block mb-1">Recommended Remediation</span>
                                <p className="leading-relaxed">{f.remediation}</p>
                              </div>
                            )}

                            {f.evidence && (
                              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
                                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 block mb-1 font-sans">
                                  Collected Telemetry Evidence
                                </span>
                                <pre className="overflow-x-auto whitespace-pre-wrap">{f.evidence}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
