// src/pages/Settings.tsx — Configuration and integration status page

import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Database, Activity, Info, ExternalLink } from 'lucide-react';
import { getHealth } from '../services/api';
import type { HealthStatus } from '../types';

function StatusBadge({ value }: { value: string }) {
  const isOk = value === 'ok' || value === 'configured';
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
      isOk
        ? 'text-green-400 bg-green-500/10 border-green-500/20'
        : value === 'not_configured'
        ? 'text-slate-400 bg-slate-700/40 border-slate-600/40'
        : 'text-red-400 bg-red-500/10 border-red-500/20'
    }`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <Info className="w-4 h-4 text-cyan-400" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="w-5 h-5 text-slate-400" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="max-w-3xl space-y-5">
        {/* Backend Health */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400" />
            Backend Status
          </h3>
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin" />
              Checking backend…
            </div>
          ) : health ? (
            <div className="space-y-3">
              {[
                { label: 'API Server', icon: Shield, value: health.status },
                { label: 'Database', icon: Database, value: health.database },
                { label: 'VirusTotal', icon: Shield, value: health.virustotal },
              ].map(({ label, icon: Icon, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-700/40 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-sm text-slate-300">{label}</span>
                  </div>
                  <StatusBadge value={value} />
                </div>
              ))}
              <p className="text-xs text-slate-500 mt-1">API Sentinel v{health.version}</p>
            </div>
          ) : (
            <p className="text-sm text-red-400">Could not reach backend at http://localhost:8000</p>
          )}
        </div>

        {/* Environment Configuration */}
        <InfoCard title="Environment Configuration">
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            API Sentinel is configured via environment variables in the backend <code className="text-cyan-400">.env</code> file.
            Secrets are stored server-side only and never exposed to this frontend.
          </p>
          <div className="space-y-3">
            {[
              {
                key: 'VIRUSTOTAL_API_KEY',
                label: 'VirusTotal API Key',
                description: 'Enables domain and URL reputation checks. Free tier: 4 requests/minute.',
                link: 'https://www.virustotal.com/gui/join-us',
              },
              {
                key: 'SCAN_LATENCY_SAMPLES',
                label: 'Latency Samples',
                description: 'Number of sequential requests for latency measurement (default: 5).',
              },
              {
                key: 'MAX_RESPONSE_BYTES',
                label: 'Max Response Size',
                description: 'Maximum response body size analyzed for leakage (default: 512 KB).',
              },
              {
                key: 'REQUEST_TIMEOUT_SECONDS',
                label: 'Request Timeout',
                description: 'Per-request timeout in seconds (default: 15).',
              },
              {
                key: 'SCAN_RATE_LIMIT_PER_MINUTE',
                label: 'Rate Limit',
                description: 'Maximum scans allowed per minute (default: 20).',
              },
              {
                key: 'REPORT_RETENTION_DAYS',
                label: 'Scan Retention',
                description: 'Days to retain scan history (default: 30).',
              },
            ].map(({ key, label, description, link }) => (
              <div key={key} className="bg-slate-800/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-cyan-400 font-mono">{key}</code>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-cyan-400 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{label}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-400 leading-relaxed">
              <strong>To apply changes:</strong> Edit <code>backend/.env</code> and restart the FastAPI server.
              Run <code>cp backend/.env.example backend/.env</code> to create the file from the template.
            </p>
          </div>
        </InfoCard>

        {/* SSRF Protection */}
        <InfoCard title="Scanner Security Protections">
          <div className="space-y-2 text-xs text-slate-400">
            {[
              'Only HTTP and HTTPS schemes are permitted — file://, ftp://, and others are blocked',
              'Loopback (127.x), private (10.x, 172.16.x, 192.168.x), link-local, and metadata IPs are blocked',
              'Embedded URL credentials (user:pass@host) are rejected',
              'Every redirect destination is validated before following',
              'Response sizes and decompression are bounded to 512 KB',
              'Request timeouts are enforced per-request',
              'Detected secrets are redacted from reports and logs — raw credentials are not persisted',
              'Third-party API keys (VirusTotal) remain server-side only',
              'YAML specifications are parsed safely without arbitrary object construction',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <Shield className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </InfoCard>

        {/* Disclaimer */}
        <InfoCard title="Assessment Limitations">
          <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
            <p>API Sentinel analyzes <strong className="text-slate-300">observable</strong> signals only — TLS configuration, response headers, response body content, and domain reputation. It does not test authentication, business logic, injection vulnerabilities, or internal application behavior.</p>
            <p>A high Security Assessment Score does not certify that an API is secure. Independent penetration testing by a qualified professional is recommended for production systems handling sensitive data.</p>
            <p>The Information Leakage check only covers response content from the specific URL submitted during the scan. Other endpoints may behave differently.</p>
          </div>
        </InfoCard>
      </div>
    </div>
  );
}
