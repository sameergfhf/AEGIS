// src/pages/SpecAnalyzer.tsx — OpenAPI / Swagger specification analyzer
// "Test in Dashboard" button added to every EndpointRow.
// Back-navigation from OperationScan restores the analysis via router state.

import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FileCode2,
  FlaskConical,
  Globe,
  Loader2,
  Lock,
  Search,
  Tag,
  Upload,
} from 'lucide-react';
import { analyzeSpecUrl, analyzeSpecFile } from '../services/api';
import type { SpecAnalysis, EndpointInfo } from '../types';
import type { OperationScanLocationState } from './OperationScan';
import toast from 'react-hot-toast';

const METHOD_COLORS: Record<string, string> = {
  GET:     'text-green-400 bg-green-500/10 border-green-500/30',
  POST:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
  PUT:     'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  PATCH:   'text-orange-400 bg-orange-500/10 border-orange-500/30',
  DELETE:  'text-red-400 bg-red-500/10 border-red-500/30',
  HEAD:    'text-slate-400 bg-slate-700/40 border-slate-600/30',
  OPTIONS: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

// ── EndpointRow ───────────────────────────────────────────────────────────────

function EndpointRow({
  endpoint,
  onTestInDashboard,
}: {
  endpoint: EndpointInfo;
  onTestInDashboard: (ep: EndpointInfo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const methodColor = METHOD_COLORS[endpoint.method] ?? 'text-slate-400 bg-slate-700/40 border-slate-600/30';

  return (
    <div className="border-b border-slate-700/40 last:border-b-0">
      {/* Row header — click anywhere except the button to expand */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 text-left min-w-0"
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`text-xs font-bold px-2 py-0.5 rounded border flex-shrink-0 w-16 text-center ${methodColor}`}>
            {endpoint.method}
          </span>
          <code className="text-slate-200 text-xs font-mono flex-1 truncate">{endpoint.path}</code>
          {endpoint.deprecated && (
            <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
              deprecated
            </span>
          )}
          {endpoint.auth_schemes.length > 0 && (
            <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          )}
          {endpoint.summary && (
            <span className="text-xs text-slate-400 hidden md:block truncate max-w-xs">{endpoint.summary}</span>
          )}
        </button>

        {/* "Test in Dashboard" button */}
        <button
          id={`test-btn-${endpoint.method}-${endpoint.path.replace(/\W/g, '-')}`}
          onClick={(e) => {
            e.stopPropagation();
            onTestInDashboard(endpoint);
          }}
          title="Run security tests against this endpoint"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border
            border-cyan-500/30 bg-cyan-500/10 text-cyan-400
            hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-300
            transition-all flex-shrink-0 whitespace-nowrap"
        >
          <FlaskConical size={12} />
          Test
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 text-xs space-y-3 bg-slate-800/20 border-t border-slate-700/30">
          {endpoint.description && (
            <p className="text-slate-400 leading-relaxed pt-3">{endpoint.description}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Parameters */}
            {endpoint.parameters.length > 0 && (
              <div>
                <p className="text-slate-500 font-medium mb-1.5 uppercase tracking-wide text-[10px]">
                  Parameters ({endpoint.parameters.length})
                </p>
                <div className="space-y-1">
                  {endpoint.parameters.map((p, i) => {
                    const param = p as Record<string, unknown>;
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <code className="text-cyan-400">{String(param.name ?? '?')}</code>
                        <span className="text-slate-600">({String(param.in ?? '')})</span>
                        {param.required && <span className="text-red-400 text-[10px]">required</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Responses */}
            {Object.keys(endpoint.responses).length > 0 && (
              <div>
                <p className="text-slate-500 font-medium mb-1.5 uppercase tracking-wide text-[10px]">Responses</p>
                <div className="space-y-1">
                  {Object.entries(endpoint.responses).map(([code, resp]) => {
                    const r = resp as Record<string, unknown>;
                    return (
                      <div key={code} className="flex items-center gap-1.5">
                        <span className={code.startsWith('2') ? 'text-green-400' : code.startsWith('4') ? 'text-orange-400' : 'text-slate-400'}>
                          {code}
                        </span>
                        <span className="text-slate-500 truncate">{String(r.description ?? '')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auth */}
            {endpoint.auth_schemes.length > 0 && (
              <div>
                <p className="text-slate-500 font-medium mb-1.5 uppercase tracking-wide text-[10px]">Auth</p>
                <div className="flex flex-wrap gap-1">
                  {endpoint.auth_schemes.map((s) => (
                    <span key={s} className="text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full text-[10px]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inline "Test in Dashboard" CTA inside expanded panel */}
          <div className="pt-2 border-t border-slate-700/30">
            <button
              onClick={() => onTestInDashboard(endpoint)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg
                bg-gradient-to-r from-cyan-600/20 to-blue-600/20
                border border-cyan-500/30 text-cyan-400
                hover:from-cyan-600/30 hover:to-blue-600/30 hover:text-cyan-300
                transition-all"
            >
              <FlaskConical size={12} />
              Test this endpoint in the Security Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SpecAnalyzer() {
  const navigate = useNavigate();
  const location = useLocation();

  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<SpecAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore analysis if navigating back from OperationScan
  useEffect(() => {
    const state = location.state as { restoredAnalysis?: SpecAnalysis } | null;
    if (state?.restoredAnalysis && !analysis) {
      setAnalysis(state.restoredAnalysis);
      // Clear the state so refreshing doesn't re-restore
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, analysis, navigate, location.pathname]);

  const handleUrlAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecUrl(url.trim());
      setAnalysis(result);
      toast.success(`Found ${result.total_endpoints} endpoints`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch specification';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_097_152) { toast.error('File must be under 2 MB'); return; }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecFile(file);
      setAnalysis(result);
      toast.success(`Parsed ${result.total_endpoints} endpoints from ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse specification';
      setError(msg);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Navigate to OperationScan with full state
  const handleTestInDashboard = (endpoint: EndpointInfo) => {
    if (!analysis) return;

    // Pass the raw base_url from the spec (possibly relative like /api/v3) plus
    // the URL the user typed so OperationScan can derive the full absolute URL.
    const rawBaseUrl = analysis.base_url ?? '';

    const state: OperationScanLocationState = {
      specId: analysis.spec_id,
      baseUrl: rawBaseUrl,           // may be relative — OperationScan handles it
      specUrl: url,                  // always the absolute URL the user typed
      endpoint,
      specTitle: analysis.title,
      specVersion: analysis.version,
      specAnalysis: analysis,
    };
    navigate('/operation-scan', { state });
  };


  const methods = [...new Set(analysis?.endpoints.map((e) => e.method) ?? [])].sort();
  const filtered = (analysis?.endpoints ?? []).filter((ep) => {
    const matchSearch = !search
      || ep.path.toLowerCase().includes(search.toLowerCase())
      || (ep.summary ?? '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = !methodFilter || ep.method === methodFilter;
    return matchSearch && matchMethod;
  });

  return (
    <div className="min-h-screen px-6 py-6">
      <div className="flex items-center gap-2 mb-6">
        <FileCode2 className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-bold text-white">API Specification Analyzer</h1>
      </div>

      {/* Input section */}
      <div className="glass-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Load OpenAPI / Swagger Specification</h2>

        <form onSubmit={handleUrlAnalyze} className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="spec-url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/openapi.json"
              className="w-full bg-slate-800/50 border border-slate-700/50 text-white text-sm pl-9 pr-4 py-2.5 rounded-lg outline-none focus:border-cyan-500/50 placeholder-slate-500"
            />
          </div>
          <button
            type="submit"
            id="analyze-spec-btn"
            disabled={!url.trim() || isLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Analyze URL
          </button>
        </form>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-700/50" />
          <span className="text-xs text-slate-500">or upload a file</span>
          <div className="flex-1 h-px bg-slate-700/50" />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            id="upload-spec-btn"
            className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-600 hover:border-slate-500 rounded-xl px-10 py-6 text-slate-400 hover:text-slate-300 transition-all disabled:opacity-50"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm">Click to upload JSON or YAML</span>
            <span className="text-xs text-slate-500">Max 2 MB</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" onChange={handleFileUpload} className="hidden" />
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-4">
          Remote URLs are validated with the same SSRF protections as API scans.
          YAML is parsed safely without arbitrary object construction.
        </p>
      </div>

      {/* Results */}
      {analysis && (
        <div className="space-y-4 fade-in">
          {/* Spec overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'API Title', value: analysis.title ?? '—' },
              { label: 'Version', value: analysis.version ?? '—' },
              { label: 'Base URL', value: analysis.base_url ?? '—' },
              { label: 'Total Endpoints', value: String(analysis.total_endpoints) },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card px-4 py-3">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-sm text-white font-medium truncate" title={value}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {analysis.auth_schemes.length > 0 && (
              <div className="glass-card px-4 py-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-slate-400">Auth:</span>
                {analysis.auth_schemes.map((s) => (
                  <span key={s} className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {analysis.deprecated_count > 0 && (
              <div className="glass-card px-4 py-3 flex items-center gap-2 border-orange-500/20">
                <Tag className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-orange-400">
                  {analysis.deprecated_count} deprecated endpoint{analysis.deprecated_count !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* "Test in Dashboard" hint */}
            <div className="glass-card px-4 py-3 flex items-center gap-2 border-cyan-500/20">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-cyan-400">
                Click <strong>Test</strong> on any endpoint to run security checks against it
              </span>
            </div>
          </div>

          {/* Endpoint table */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search endpoints…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700/50 text-white text-xs pl-8 pr-3 py-1.5 rounded-lg outline-none focus:border-cyan-500/50 placeholder-slate-500"
                />
              </div>
              <div className="flex gap-1">
                {['', ...methods].map((m) => (
                  <button
                    key={m || 'all'}
                    onClick={() => setMethodFilter(m)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                      methodFilter === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m || 'All'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 ml-auto">{filtered.length} endpoints</span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No endpoints match your filter</div>
              ) : (
                filtered.map((ep, i) => (
                  <EndpointRow key={i} endpoint={ep} onTestInDashboard={handleTestInDashboard} />
                ))
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            This specification analysis is informational. Documented endpoints may not reflect the complete
            server implementation. Do not scan or attack listed endpoints without explicit authorization.
          </p>
        </div>
      )}
    </div>
  );
}
