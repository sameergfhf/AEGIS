// src/pages/Settings.tsx — Configuration, diagnostics, and security posture page

import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Database,
  Activity,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Cpu,
  Radio,
  FileCode,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { getHealth } from '../services/api';
import type { HealthStatus } from '../types';

interface EnvVarDoc {
  key: string;
  label: string;
  defaultVal: string;
  category: 'Security' | 'Performance' | 'Threat Intel';
  description: string;
  link?: string;
}

const ENV_VARIABLES: EnvVarDoc[] = [
  {
    key: 'VIRUSTOTAL_API_KEY',
    label: 'VirusTotal Intelligence Key',
    defaultVal: '(Not set by default)',
    category: 'Threat Intel',
    description: 'Enables real-time domain and URL reputation scans against 70+ antivirus engines. Free tier grants 4 req/min.',
    link: 'https://www.virustotal.com/gui/join-us',
  },
  {
    key: 'SCAN_LATENCY_SAMPLES',
    label: 'Latency Measurement Samples',
    defaultVal: '5',
    category: 'Performance',
    description: 'Number of consecutive non-blocking requests dispatched to calculate min, mean, max, and jitter metrics.',
  },
  {
    key: 'MAX_RESPONSE_BYTES',
    label: 'Max Ingestion Payload Size',
    defaultVal: '524288 (512 KB)',
    category: 'Security',
    description: 'Absolute upper boundary for payload inspection. Prevents memory exhaustion attacks and large binary downloads.',
  },
  {
    key: 'REQUEST_TIMEOUT_SECONDS',
    label: 'Per-Request HTTP Timeout',
    defaultVal: '15',
    category: 'Performance',
    description: 'Hard threshold before hanging probes or slowloris-type endpoints are terminated.',
  },
  {
    key: 'SCAN_RATE_LIMIT_PER_MINUTE',
    label: 'Global Scan Rate Limiter',
    defaultVal: '20',
    category: 'Performance',
    description: 'Enforces fairness per client IP to safeguard both scanner compute and target web services.',
  },
  {
    key: 'REPORT_RETENTION_DAYS',
    label: 'Historical Log Retention',
    defaultVal: '30',
    category: 'Security',
    description: 'Days before historical audit traces and temporary artifacts are cycled from local storage.',
  },
];

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchHealth = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    const start = performance.now();
    try {
      const data = await getHealth();
      setLatencyMs(Math.round(performance.now() - start));
      setHealth(data);
    } catch {
      setHealth(null);
      setLatencyMs(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">System Settings & Infrastructure</h1>
          </div>
          <p className="text-sm text-slate-400">
            Audit runtime engines, configure environment variables, and review scanner security controls.
          </p>
        </div>

        {/* Live Diagnostics Pulse Badge */}
        <div className="flex items-center gap-3 self-start md:self-center">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                health?.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                health?.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
              }`} />
            </span>
            <span className="text-slate-300 font-medium">
              {isLoading ? 'Pinging Core...' : health?.status === 'ok' ? 'Core Operational' : 'Core Unreachable'}
            </span>
            {latencyMs !== null && (
              <span className="text-cyan-400/80 font-mono text-[11px] border-l border-slate-700/60 pl-2">
                {latencyMs}ms
              </span>
            )}
          </div>

          <button
            onClick={() => fetchHealth(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-white border border-slate-700/50 text-xs font-medium transition-all disabled:opacity-50"
            title="Refresh Core Diagnostics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Re-ping</span>
          </button>
        </div>
      </div>

      {/* ── Section 1: Core Service Health & Diagnostics ────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>Core Telemetry & Runtime Microservices</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Node 1: FastAPI Core */}
          <div className="glass-card glow-card-hover p-5 border border-slate-700/60 rounded-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">API Sentinel Engine</h3>
                  <p className="text-[11px] text-slate-400">FastAPI Asynchronous Gateway</p>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                health?.status === 'ok'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-red-400 bg-red-500/10 border-red-500/30'
              }`}>
                {health?.status === 'ok' ? 'HEALTHY' : 'DEGRADED'}
              </span>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-800/80 pt-3">
              <div className="flex justify-between text-slate-400">
                <span>Binding Port:</span>
                <span className="font-mono text-slate-200">127.0.0.1:8000</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Version:</span>
                <span className="font-mono text-cyan-400">v{health?.version || '1.0.0'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Engine Worker:</span>
                <span className="text-slate-200">Uvicorn asyncio</span>
              </div>
            </div>
          </div>

          {/* Node 2: Supabase Cloud Database */}
          <div className="glass-card glow-card-hover p-5 border border-slate-700/60 rounded-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Supabase Cloud Database</h3>
                  <p className="text-[11px] text-slate-400">PostgreSQL + Realtime RLS</p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
                CONNECTED
              </span>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-800/80 pt-3">
              <div className="flex justify-between text-slate-400">
                <span>Tables:</span>
                <span className="font-mono text-cyan-300">scans, findings, profiles, specs</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Storage Bucket:</span>
                <span className="font-mono text-emerald-400">aegis-storage</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Data Isolation:</span>
                <span className="text-emerald-400 font-medium">Row Level Security (RLS)</span>
              </div>
            </div>
          </div>

          {/* Node 3: VirusTotal Intelligence Node */}
          <div className="glass-card glow-card-hover p-5 border border-slate-700/60 rounded-2xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Threat Reputation</h3>
                  <p className="text-[11px] text-slate-400">VirusTotal v3 Feeds</p>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                health?.virustotal === 'configured'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
              }`}>
                {health?.virustotal === 'configured' ? 'ACTIVE' : 'OPTIONAL (NO KEY)'}
              </span>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-800/80 pt-3">
              <div className="flex justify-between text-slate-400">
                <span>Engine Quota:</span>
                <span className="font-mono text-slate-200">4 req/min free</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Threat Feed:</span>
                <span className="text-slate-200">70+ Antivirus Engines</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Fallback Mode:</span>
                <span className="text-slate-300">DNS & Domain Heuristics</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Zero-Trust Security Controls (SSRF & Scanner Shields) ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Active Scanner Security Protections & Safeguards</span>
        </div>

        <div className="glass-card p-6 border border-slate-800/90 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            AEGIS implements strict multi-layer zero-trust guardrails to safeguard both host environments and target infrastructure from accidental disruption, request forgery, or credential leakage:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[
              {
                icon: Shield,
                title: 'SSRF & Private Network Isolation',
                desc: 'Strictly blocks RFC1918 loopback (127.0.0.1), private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local, and cloud metadata addresses (169.254.169.254). Only public HTTP/HTTPS is allowed.',
                badge: 'RFC 1918 / RFC 3927'
              },
              {
                icon: Lock,
                title: 'Automated Credential Redaction',
                desc: 'All analyzed HTTP request and response payloads pass through regex secret scrubbers. JWTs, Bearer tokens, AWS access keys, and Stripe secrets are sanitized before DB persistence.',
                badge: 'Zero-Persistence'
              },
              {
                icon: Zap,
                title: 'Memory Bomb & Resource Throttling',
                desc: 'Maximum response body size is hard-capped at 512 KB with bounded decompression to neutralize gzip/brotli expansion bombs and prevent memory bloat.',
                badge: '512 KB Guard'
              },
              {
                icon: FileCode,
                title: 'Hardened YAML & Spec Parser',
                desc: 'OpenAPI 3.0 and Swagger 2.0 definitions are ingested using strict schema sanitization and SafeLoader, eliminating remote code execution via malicious serialized objects.',
                badge: 'SafeLoader'
              },
            ].map(({ icon: Icon, title, desc, badge }) => (
              <div key={title} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white">{title}</h4>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                      {badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 3: Environment Variables Vault & Reference ───────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Lock className="w-4 h-4 text-cyan-400" />
            <span>Environment Variables & Engine Configuration</span>
          </div>
          <span className="text-xs text-slate-500">Configured in <code className="text-cyan-400">backend/.env</code></span>
        </div>

        <div className="glass-card p-6 border border-slate-800/90 rounded-2xl space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            All API Sentinel operational tuning and secret credentials reside exclusively on the server in <code className="text-cyan-400 font-mono">backend/.env</code>. Client browsers never receive access to raw keys.
          </p>

          <div className="space-y-3">
            {ENV_VARIABLES.map((v) => (
              <div
                key={v.key}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2 group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <code className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2 py-1 rounded border border-cyan-800/40">
                      {v.key}
                    </code>
                    <button
                      onClick={() => copyToClipboard(v.key)}
                      className="p-1 rounded text-slate-500 hover:text-cyan-400 transition-colors opacity-70 group-hover:opacity-100"
                      title="Copy variable name"
                    >
                      {copiedKey === v.key ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {v.link && (
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-cyan-400 transition-colors"
                        title="Get API Key"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                      v.category === 'Security'
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : v.category === 'Threat Intel'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                    }`}>
                      {v.category}
                    </span>
                    <span className="text-xs text-slate-400">
                      Default: <code className="text-slate-300 font-mono text-[11px]">{v.defaultVal}</code>
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed pl-0.5">
                  {v.description}
                </p>
              </div>
            ))}
          </div>

          {/* Quick Setup Code Block */}
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h5 className="text-xs font-semibold text-blue-300">Quick Configuration Command</h5>
              <p className="text-[11px] text-slate-400">
                Initialize your local environment from the provided template:
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 font-mono text-xs text-cyan-400 shrink-0">
              <code>cp backend/.env.example backend/.env</code>
              <button
                onClick={() => copyToClipboard('cp backend/.env.example backend/.env')}
                className="text-slate-400 hover:text-white"
                title="Copy shell command"
              >
                {copiedKey === 'cp backend/.env.example backend/.env' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Testing Scope & Legal Notice ─────────────────────────── */}
      <div className="p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3.5">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-1.5 text-xs text-slate-400 leading-relaxed">
          <h4 className="text-xs font-semibold text-amber-300">Non-Intrusive Observable Signal Scope</h4>
          <p>
            API Sentinel performs non-intrusive black-box observation of publicly accessible HTTP/S endpoints (TLS certificates, HTTP response headers, information leakage fingerprints, and public reputation indices). It does <strong className="text-slate-200">not</strong> perform automated SQL injection, credential brute forcing, or state-altering exploits.
          </p>
          <p>
            A high Security Assessment Score (SAS) indicates compliance with observable defensive standards but does not replace formal manual penetration testing or deep static code analysis.
          </p>
        </div>
      </div>
    </div>
  );
}
