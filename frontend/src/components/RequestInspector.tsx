// src/components/RequestInspector.tsx — HTTP request/response inspector

import { useState } from 'react';
import { Globe, Clock } from 'lucide-react';
import type { Scan } from '../types';

interface Props {
  scan: Scan;
}

interface ParsedResult {
  response: {
    status_code?: number;
    headers?: Record<string, string>;
    content_type?: string;
    redirect_destinations?: string[];
  };
  resolved_ip?: string;
}

export default function RequestInspector({ scan }: Props) {
  const [activeTab, setActiveTab] = useState<'response' | 'headers' | 'redirects'>('response');

  let parsed: ParsedResult | null = null;
  try {
    if (scan.result_json) {
      parsed = JSON.parse(scan.result_json);
    }
  } catch {
    // ignore
  }

  const response = parsed?.response;
  const headers = response?.headers ?? {};
  const redirects = response?.redirect_destinations ?? [];
  const statusCode = response?.status_code;
  const contentType = response?.content_type ?? '';

  const statusColor =
    statusCode && statusCode >= 200 && statusCode < 300
      ? 'text-green-400'
      : statusCode && statusCode >= 400
      ? 'text-red-400'
      : 'text-yellow-400';

  return (
    <div className="glass-card glow-card-hover border border-slate-700/60 rounded-2xl p-6 fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-blue-400" />
        <h3 className="text-base font-semibold text-white">Request & Response Inspector</h3>
        {scan.duration_ms && (
          <div className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {scan.duration_ms.toFixed(0)}ms total
          </div>
        )}
      </div>

      {/* URL row */}
      <div className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-4 py-2.5 mb-4 text-sm">
        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
          GET
        </span>
        <code className="text-slate-300 font-mono text-xs truncate flex-1">{scan.url}</code>
        {statusCode && (
          <span className={`text-sm font-bold ${statusColor}`}>{statusCode}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/40 rounded-lg p-1">
        {(['response', 'headers', 'redirects'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium capitalize ${
              activeTab === tab
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab}
            {tab === 'redirects' && redirects.length > 0 && (
              <span className="ml-1 text-orange-400">({redirects.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-slate-900/50 rounded-lg p-4 min-h-24 max-h-64 overflow-auto font-mono text-xs">
        {activeTab === 'response' && (
          <div className="space-y-1 text-slate-300">
            <div><span className="text-slate-500">URL: </span>{scan.url}</div>
            <div><span className="text-slate-500">Method: </span>GET</div>
            {statusCode && <div><span className="text-slate-500">Status: </span><span className={statusColor}>{statusCode}</span></div>}
            <div><span className="text-slate-500">Content-Type: </span>{contentType || '—'}</div>
            {parsed?.resolved_ip && <div><span className="text-slate-500">Resolved IP: </span><span className="text-cyan-400">{parsed.resolved_ip}</span></div>}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-1">
            {Object.entries(headers).length === 0 ? (
              <p className="text-slate-500">No headers recorded.</p>
            ) : (
              Object.entries(headers).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-blue-400 flex-shrink-0">{k}:</span>
                  <span className="text-slate-300 break-all">{v}</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'redirects' && (
          <div className="space-y-1">
            {redirects.length === 0 ? (
              <p className="text-slate-500">No redirects observed.</p>
            ) : (
              redirects.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-orange-400">→</span>
                  <span className="text-slate-300">{url}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Credentials, authorization headers, and detected secrets are redacted from this view.
      </p>
    </div>
  );
}
