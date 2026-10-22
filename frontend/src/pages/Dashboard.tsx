// src/pages/Dashboard.tsx — Security Operations Console with quick scan & posture metrics
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Scan,
  AlertCircle,
  TrendingUp,
  Globe,
  Sparkles,
  ArrowRight,
  Clock,
  Activity,
  ChevronRight,
  Zap,
  Server,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useScan } from '../hooks/useScan';
import { getScanHistory } from '../services/api';
import type { ScanSummary } from '../types';

const SAMPLE_PRESETS = [
  { label: 'GitHub API', url: 'https://api.github.com' },
  { label: 'Stripe API', url: 'https://api.stripe.com/v1/charges' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'HTTPBin Echo', url: 'https://httpbin.org/get' },
];

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) {
    return <span className="text-slate-500 font-mono text-xs">—</span>;
  }
  let color = 'text-red-400 bg-red-500/10 border-red-500/30';
  let grade = 'F';
  if (score >= 90) {
    color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    grade = 'A+';
  } else if (score >= 75) {
    color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    grade = 'B';
  } else if (score >= 50) {
    color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    grade = 'C';
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono ${color}`}>
      <span className="font-extrabold text-xs">{score.toFixed(0)}</span>
      <span className="text-[10px] font-bold opacity-80">({grade})</span>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLoading, error, startScan, scan } = useScan();
  const [url, setUrl] = useState('');
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);
  const [totalScans, setTotalScans] = useState(0);

  useEffect(() => {
    getScanHistory(6, 0)
      .then((r) => {
        setRecentScans(r.scans);
        setTotalScans(r.total);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scan?.status === 'completed') {
      navigate(`/scan/${scan.id}`);
    }
  }, [scan, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Please enter an API URL to scan.');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      toast.error('URL must begin with http:// or https://');
      return;
    }
    await startScan(trimmed);
  };

  // Calculate average score
  const completedScans = recentScans.filter((s) => s.assessment_score !== undefined && s.assessment_score !== null);
  const avgScore = completedScans.length > 0
    ? completedScans.reduce((acc, s) => acc + (s.assessment_score ?? 0), 0) / completedScans.length
    : null;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-8">
      {/* ── Top Header Banner ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Security Operations</span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Engine Online
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            API Security Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Dispatch non-invasive observable security checks against any API endpoint.
          </p>
        </div>

        {/* Quick Posture Stat Pills */}
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2.5 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Scans</p>
              <p className="text-base font-extrabold text-white font-mono">{totalScans}</p>
            </div>
          </div>

          <div className="glass-card px-4 py-2.5 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Avg Posture</p>
              <p className="text-base font-extrabold text-white font-mono">
                {avgScore !== null ? `${avgScore.toFixed(0)}/100` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Scan Trigger Cockpit ─────────────────────────────────────────── */}
      <div className="glass-card border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-cyan-950/30 relative overflow-hidden">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Target Ingestion
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Scan Target API Endpoint
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
              Performs strict SSRF RFC 1918 validation, TLS 1.3 verification, defensive headers audit,
              server banner reconnaissance, and threat reputation feeds.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="gradient-border p-px rounded-2xl">
              <div className="flex items-center gap-3 bg-slate-900 rounded-2xl px-4 py-3 sm:px-5 sm:py-4">
                <Globe className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  id="api-url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/health"
                  className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm font-mono"
                  disabled={isLoading || scan?.status === 'running' || scan?.status === 'pending'}
                  autoFocus
                />
                {url && (
                  <button
                    type="button"
                    onClick={() => setUrl('')}
                    className="text-xs text-slate-500 hover:text-slate-300 px-2"
                  >
                    Clear
                  </button>
                )}
                <button
                  id="start-scan-btn"
                  type="submit"
                  disabled={!url.trim() || isLoading || scan?.status === 'running' || scan?.status === 'pending'}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
                >
                  {isLoading || scan?.status === 'running' || scan?.status === 'pending' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Auditing…</span>
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      <span>Execute Audit</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Sample Presets */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs pt-1">
              <span className="text-slate-500 font-medium mr-1 flex items-center gap-1">
                <Zap className="w-3 h-3 text-cyan-400" /> Presets:
              </span>
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setUrl(preset.url)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white transition-all font-mono text-[11px] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* In-Flight Scan Status Banner */}
            {(scan?.status === 'pending' || scan?.status === 'running') && (
              <div className="glass-card border border-cyan-500/40 p-4 rounded-xl flex items-center gap-3 bg-cyan-950/20">
                <div className="w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Scan in Progress</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Probing: {scan.url}
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20">
                  {scan.status}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Security Pillars Overview Matrix ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'TLS 1.3 Cryptography',
            desc: 'Cipher suite security, SAN domain match, cert expiration window.',
            icon: Lock,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/10',
            border: 'border-cyan-500/20',
          },
          {
            title: 'Defensive Headers',
            desc: 'HSTS preloading, CSP policies, X-Content-Type, CORS enforcement.',
            icon: Shield,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
          },
          {
            title: 'Recon & Info Leaks',
            desc: 'Server header suppression, framework fingerprints, stack dump check.',
            icon: Server,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
          },
          {
            title: 'Threat Intelligence',
            desc: 'VirusTotal 70+ vendor malware & phishing telemetry feeds.',
            icon: Activity,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20',
          },
        ].map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.title}
              className="glass-card p-5 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all"
            >
              <div className={`w-9 h-9 rounded-lg ${pillar.bg} border ${pillar.border} flex items-center justify-center mb-3 ${pillar.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">{pillar.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{pillar.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Recent Scans Feed ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Recent Security Audits</h2>
            <span className="text-xs text-slate-500 font-mono">({recentScans.length} recent)</span>
          </div>
          {recentScans.length > 0 && (
            <button
              onClick={() => navigate('/history')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              View Full History <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentScans.length === 0 ? (
          <div className="glass-card p-10 text-center rounded-2xl border border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No Scans Recorded Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              Enter an API URL above or click a preset to perform your first non-invasive observable security scan.
            </p>
            <button
              onClick={() => setUrl('https://api.github.com')}
              className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-all cursor-pointer"
            >
              Try GitHub API Demo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentScans.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/scan/${s.id}`)}
                className="glass-card p-4 rounded-xl border border-slate-800/80 hover:border-cyan-500/40 text-left transition-all group flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white font-mono truncate max-w-[180px] group-hover:text-cyan-300 transition-colors">
                      {s.hostname}
                    </span>
                    <ScoreBadge score={s.assessment_score} />
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate mb-3">
                    {s.url}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${
                        s.status === 'completed' ? 'bg-emerald-400' :
                        s.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                      }`} />
                      <span className="capitalize">{s.status}</span>
                    </span>
                    {s.user_id && user && s.user_id === user.id ? (
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                        Mine
                      </span>
                    ) : null}
                  </div>
                  <span className="group-hover:text-cyan-400 flex items-center gap-1 transition-colors">
                    View <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
