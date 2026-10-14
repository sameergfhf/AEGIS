// src/pages/Dashboard.tsx — Main landing page with URL input and scan trigger

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Scan, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useScan } from '../hooks/useScan';
import { getScanHistory } from '../services/api';
import { useEffect } from 'react';
import type { ScanSummary } from '../types';

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return <span className="text-slate-500">—</span>;
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : score >= 40 ? 'text-orange-400' : 'text-red-400';
  return <span className={`font-bold ${color}`}>{score.toFixed(0)}</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoading, error, startScan, scan } = useScan();
  const [url, setUrl] = useState('');
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);

  useEffect(() => {
    getScanHistory(5, 0)
      .then((r) => setRecentScans(r.scans))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scan?.status === 'completed') {
      navigate(`/scan/${scan.id}`);
    }
  }, [scan, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      toast.error('URL must start with http:// or https://');
      return;
    }
    await startScan(trimmed);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        {/* Badge */}
        <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium px-4 py-1.5 rounded-full mb-8">
          <Shield className="w-3.5 h-3.5" />
          API Security Scanner
        </div>

        {/* Title */}
        <h1 className="text-5xl font-extrabold text-center text-white mb-4 leading-tight">
          Analyze Your API's
          <br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Security Posture
          </span>
        </h1>
        <p className="text-slate-400 text-center max-w-xl mb-12 leading-relaxed">
          API Sentinel performs observable security checks — TLS health, security headers,
          information leakage, and domain reputation — and generates an evidence-based assessment report.
        </p>

        {/* URL Input Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl">
          <div className="gradient-border p-px rounded-2xl">
            <div className="flex items-center gap-3 bg-slate-900 rounded-2xl px-5 py-4">
              <Globe className="w-5 h-5 text-slate-500 flex-shrink-0" />
              <input
                id="api-url-input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/v1/users"
                className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
                disabled={isLoading || scan?.status === 'running' || scan?.status === 'pending'}
                autoFocus
              />
              <button
                id="start-scan-btn"
                type="submit"
                disabled={!url.trim() || isLoading || scan?.status === 'running' || scan?.status === 'pending'}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || scan?.status === 'running' || scan?.status === 'pending' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scanning…
                  </>
                ) : (
                  <>
                    <Scan className="w-4 h-4" />
                    Scan
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 mt-3 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {(scan?.status === 'pending' || scan?.status === 'running') && (
            <div className="mt-4 glass-card p-4 flex items-center gap-3">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <div className="flex-1">
                <p className="text-sm text-white font-medium">Scan in progress…</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Running {scan.status === 'running' ? 'security checks' : 'initializing'}
                </p>
              </div>
              <span className="text-xs text-slate-500 capitalize">{scan.status}</span>
            </div>
          )}
        </form>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mt-10">
          {[
            { icon: Shield, label: 'TLS / HTTPS Check', color: 'text-cyan-400' },
            { icon: CheckCircle, label: 'Security Headers', color: 'text-blue-400' },
            { icon: AlertCircle, label: 'Info Leakage', color: 'text-orange-400' },
            { icon: TrendingUp, label: 'Domain Reputation', color: 'text-purple-400' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs px-4 py-2 rounded-full"
            >
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="px-8 pb-8 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Recent Scans</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              View all →
            </button>
          </div>
          <div className="space-y-2">
            {recentScans.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/scan/${s.id}`)}
                className="w-full glass-card px-4 py-3 flex items-center gap-4 hover:border-slate-600 transition-all text-left"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === 'completed' ? 'bg-green-400' :
                  s.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate font-mono">{s.hostname}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(s.started_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <ScoreBadge score={s.assessment_score} />
                  <p className="text-xs text-slate-500">/ 100</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Globe(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
    </svg>
  );
}
