// src/pages/ScanResults.tsx — Full scan result view

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, ArrowLeft, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useScan } from '../hooks/useScan';
import { getReportUrl } from '../services/api';
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
  const { scan, findings, visualizations, isLoading, isPolling, error, loadScan } = useScan();

  useEffect(() => {
    if (scanId) {
      loadScan(scanId);
    }
  }, [scanId, loadScan]);

  if (isLoading && !scan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm">Loading scan…</p>
        </div>
      </div>
    );
  }

  if (error && !scan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center max-w-md">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Error Loading Scan</h2>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="text-sm text-cyan-400 hover:text-cyan-300">
            ← Back to Dashboard
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

  return (
    <div className="min-h-screen px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-xl font-bold text-white">{scan.hostname}</h1>
          <p className="text-xs text-slate-500 font-mono mt-1 truncate max-w-lg">{scan.url}</p>
        </div>

        <div className="flex items-center gap-3">
          {isPolling && (
            <div className="flex items-center gap-2 text-sm text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-lg">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Scanning…
            </div>
          )}

          {scan.status === 'completed' && (
            <a
              href={getReportUrl(scan.id)}
              download
              id="download-report-btn"
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
              onClick={() => toast.success('Downloading PDF report…')}
            >
              <Download className="w-4 h-4" />
              PDF Report
            </a>
          )}
        </div>
      </div>

      {/* Scanning state */}
      {isRunning && (
        <div className="glass-card p-6 mb-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
          <div>
            <p className="text-white font-semibold">Scan in progress</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Running security checks — this typically takes 15–30 seconds
            </p>
          </div>
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="glass-card p-6 mb-6 border-red-500/20 bg-red-500/5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">Scan Failed</p>
            <p className="text-sm text-slate-400 mt-1">{scan.error_message || 'The scan could not be completed.'}</p>
          </div>
        </div>
      )}

      {/* Completed results */}
      {scan.status === 'completed' && (
        <div className="space-y-6">
          {/* Score + Request Inspector */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ScoreCard scan={scan} />
            <RequestInspector scan={scan} />
          </div>

          {/* Test Results */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Security Tests
            </h2>
            <div className="space-y-3">
              {TEST_ORDER.map((key) =>
                testResults[key] ? (
                  <TestResultCard key={key} testKey={key} result={testResults[key]} />
                ) : null,
              )}
            </div>
          </div>

          {/* Charts */}
          {visualizations && (
            <>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
                Visualizations
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <LatencyChart latency={visualizations.latency} />
                <FindingsChart
                  findingsBySeverity={visualizations.findings_by_severity}
                  findings={findings}
                />
              </div>

              {/* Flow diagram — full width */}
              <FlowDiagram flow={visualizations.flow} />
            </>
          )}

          {/* Findings table */}
          {findings.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Detailed Findings
              </h2>
              <div className="glass-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Finding</th>
                      <th className="text-left px-4 py-3">Category</th>
                      <th className="text-left px-4 py-3">Severity</th>
                      <th className="text-left px-4 py-3">Confidence</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f, i) => (
                      <tr
                        key={f.id}
                        className={`border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors ${
                          i % 2 === 0 ? '' : 'bg-slate-800/10'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-slate-200 font-medium">{f.title}</p>
                          {f.description && (
                            <p className="text-slate-500 mt-0.5 leading-relaxed">{f.description.slice(0, 100)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{f.category}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full border text-xs severity-${f.severity}`}>
                            {f.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 capitalize">{f.confidence}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium status-${f.status}`}>
                            {f.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
