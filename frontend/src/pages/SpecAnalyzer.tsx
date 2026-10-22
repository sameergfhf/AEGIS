// src/pages/SpecAnalyzer.tsx — OpenAPI & Swagger 3.0 Deep Specification Analyzer
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
  Upload,
  Zap,
  ChevronDown,
  ChevronRight,
  Layers,
  X,
} from 'lucide-react';
import { analyzeSpecUrl, analyzeSpecFile } from '../services/api';
import { fetchSpecUploadsFromSupabase } from '../services/supabaseService';
import type { SpecAnalysis, EndpointInfo } from '../types';
import type { OperationScanLocationState } from './OperationScan';
import toast from 'react-hot-toast';

const METHOD_COLORS: Record<string, string> = {
  GET:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  POST:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
  PUT:     'text-amber-400 bg-amber-500/10 border-amber-500/30',
  PATCH:   'text-orange-400 bg-orange-500/10 border-orange-500/30',
  DELETE:  'text-rose-400 bg-rose-500/10 border-rose-500/30',
  HEAD:    'text-slate-400 bg-slate-700/40 border-slate-600/30',
  OPTIONS: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

// Quick sample OpenAPI specs
const SAMPLE_SPECS = [
  { label: 'Local API Sentinel Spec', url: 'http://localhost:8000/openapi.json' },
  { label: 'Swagger Petstore v2', url: 'https://petstore.swagger.io/v2/swagger.json' },
];

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
    <div className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-850/40 transition-colors">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          className="flex items-center gap-3 flex-1 text-left min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`text-[11px] font-mono font-extrabold px-2.5 py-0.5 rounded-md border flex-shrink-0 w-16 text-center ${methodColor}`}>
            {endpoint.method}
          </span>
          <code className="text-white text-xs font-mono font-semibold flex-1 truncate">{endpoint.path}</code>

          {endpoint.deprecated && (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
              deprecated
            </span>
          )}

          {endpoint.auth_schemes.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
              <Lock className="w-3 h-3" />
              <span>{endpoint.auth_schemes.join(', ')}</span>
            </div>
          )}

          {endpoint.summary && (
            <span className="text-xs text-slate-400 hidden lg:block truncate max-w-sm">{endpoint.summary}</span>
          )}

          <div className="text-slate-500 hover:text-slate-300 ml-2">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {/* Test CTA */}
        <button
          id={`test-btn-${endpoint.method}-${endpoint.path.replace(/\W/g, '-')}`}
          onClick={(e) => {
            e.stopPropagation();
            onTestInDashboard(endpoint);
          }}
          title="Run targeted security scan against this endpoint"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
            border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-semibold
            hover:bg-cyan-500/20 hover:border-cyan-500/60 hover:text-cyan-200
            transition-all flex-shrink-0 whitespace-nowrap cursor-pointer shadow-sm shadow-cyan-500/10"
        >
          <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
          <span>Test Endpoint</span>
        </button>
      </div>

      {expanded && (
        <div className="px-5 py-4 text-xs space-y-4 bg-slate-900/60 border-t border-slate-800/80 fade-in">
          {endpoint.description && (
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Description</p>
              <p className="text-slate-300 leading-relaxed font-sans">{endpoint.description}</p>
            </div>
          )}

          {endpoint.parameters.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                Declared Parameters ({endpoint.parameters.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {endpoint.parameters.map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">{String(p.name ?? 'param')}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{String(p.in ?? '')}</span>
                    </div>
                    {Boolean(p.required) && (
                      <span className="text-[9px] text-amber-400 font-bold uppercase mt-1 block">
                        Required
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No parameters required for this operation.</p>
          )}

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Ready to execute observational checks against this operation?
            </span>
            <button
              onClick={() => onTestInDashboard(endpoint)}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
            >
              Configure and dispatch audit →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SpecAnalyzer() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<SpecAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savedSpecs, setSavedSpecs] = useState<any[]>([]);

  useEffect(() => {
    fetchSpecUploadsFromSupabase()
      .then((specs) => {
        if (specs && specs.length > 0) setSavedSpecs(specs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const state = location.state as { restoredAnalysis?: SpecAnalysis } | null;
    if (state?.restoredAnalysis && !analysis) {
      setAnalysis(state.restoredAnalysis);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, analysis, navigate, location.pathname]);

  const handleUrlAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      toast.error('Please enter a schema URL');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecUrl(url.trim());
      setAnalysis(result);
      toast.success(`Parsed ${result.total_endpoints} endpoints from schema!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch specification';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_097_152) {
      toast.error('File exceeds max size of 2 MB');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecFile(file);
      setAnalysis(result);
      toast.success(`Parsed ${result.total_endpoints} endpoints from ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse specification';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTestInDashboard = (endpoint: EndpointInfo) => {
    if (!analysis) return;
    const rawBaseUrl = analysis.base_url ?? '';
    const state: OperationScanLocationState = {
      specId: analysis.spec_id,
      baseUrl: rawBaseUrl,
      specUrl: url,
      endpoint,
      specTitle: analysis.title,
      specVersion: analysis.version,
      specAnalysis: analysis,
    };
    navigate('/operation-scan', { state });
  };

  const methods = [...new Set(analysis?.endpoints.map((e) => e.method) ?? [])].sort();
  const filtered = (analysis?.endpoints ?? []).filter((ep) => {
    const matchSearch =
      !search ||
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      (ep.summary ?? '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = !methodFilter || ep.method === methodFilter;
    return matchSearch && matchMethod;
  });

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-8">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-800/80 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Schema Inspection</span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400">OpenAPI 3.0 / Swagger 2.0</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <FileCode2 className="w-6 h-6 text-cyan-400" />
            API Specification Analyzer
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Ingest API schemas to discover routes, audit parameter declarations, and execute 1-click single-endpoint scans.
          </p>
        </div>

        {analysis && (
          <button
            onClick={() => setAnalysis(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 text-xs font-semibold hover:border-slate-600 hover:text-white transition-all self-start sm:self-auto cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Clear Analysis
          </button>
        )}
      </div>

      {/* ── Schema Ingestion Card ────────────────────────────────────────────── */}
      <div className="glass-card border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Load API Specification
            </h2>
          </div>

          {/* Ingestion Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('url')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'url' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Remote URL
            </button>
            <button
              onClick={() => setActiveTab('file')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'file' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Upload File
            </button>
          </div>
        </div>

        {activeTab === 'url' ? (
          <form onSubmit={handleUrlAnalyze} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="spec-url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/openapi.json"
                  className="w-full bg-slate-900/90 border border-slate-700/80 text-white text-xs sm:text-sm pl-10 pr-4 py-3 rounded-xl outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500 font-mono transition-all"
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                id="analyze-spec-btn"
                disabled={!url.trim() || isLoading}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing Spec…</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Analyze Schema</span>
                  </>
                )}
              </button>
            </div>

            {/* Sample URLs */}
            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
              <span className="text-slate-500 font-medium mr-1 flex items-center gap-1">
                <Zap className="w-3 h-3 text-cyan-400" /> Quick Samples:
              </span>
              {SAMPLE_SPECS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => setUrl(sample.url)}
                  className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all font-mono text-[11px] cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}

              {savedSpecs.length > 0 && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="text-cyan-400 font-medium flex items-center gap-1">
                    <FileCode2 className="w-3 h-3" /> Supabase Vault ({savedSpecs.length}):
                  </span>
                  {savedSpecs.slice(0, 3).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (s.spec_url) setUrl(s.spec_url);
                        else if (s.metadata) setAnalysis({
                          spec_id: s.id,
                          title: s.metadata.title || s.filename,
                          version: s.version || '3.0.0',
                          endpoints: s.metadata.endpoints || [],
                          total_endpoints: s.endpoints || 0,
                          deprecated_count: 0,
                          auth_schemes: [],
                          base_url: s.spec_url || '',
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-200 hover:text-white transition-all font-mono text-[11px] cursor-pointer flex items-center gap-1"
                    >
                      <span>{s.filename}</span>
                      <span className="text-[9px] text-cyan-400">({s.endpoints} ep)</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-8 transition-colors bg-slate-900/40 text-center">
            <Upload className="w-8 h-8 text-cyan-400 mb-3" />
            <h3 className="text-sm font-semibold text-white mb-1">Upload OpenAPI JSON or YAML</h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm">
              Supports Swagger 2.0, OpenAPI 3.0.x, and 3.1.x schemas up to 2 MB.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20 transition-all cursor-pointer"
            >
              Choose Schema File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Analyzed Specification Results ───────────────────────────────────── */}
      {analysis && (
        <div className="space-y-6 fade-in">
          {/* Metadata KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">API Title</span>
              <p className="text-sm font-bold text-white truncate mt-1">{analysis.title ?? 'Untitled API'}</p>
            </div>
            <div className="glass-card p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spec Version</span>
              <p className="text-sm font-mono font-bold text-cyan-400 mt-1">{analysis.version ?? '1.0.0'}</p>
            </div>
            <div className="glass-card p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Base Server URL</span>
              <p className="text-sm font-mono text-slate-300 truncate mt-1">{analysis.base_url || '/'}</p>
            </div>
            <div className="glass-card p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Operations</span>
              <p className="text-sm font-mono font-extrabold text-emerald-400 mt-1">{analysis.total_endpoints}</p>
            </div>
          </div>

          {/* Filter Bar & Method Chips */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search endpoints by path or summary…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white text-xs sm:text-sm pl-9 pr-4 py-2 rounded-xl outline-none focus:border-cyan-500/50 placeholder-slate-500 font-mono"
              />
            </div>

            {/* Method Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setMethodFilter('')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  methodFilter === '' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All ({analysis.endpoints.length})
              </button>
              {methods.map((m) => {
                const count = analysis.endpoints.filter((e) => e.method === m).length;
                return (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(methodFilter === m ? '' : m)}
                    className={`px-2.5 py-1.5 rounded-lg font-mono font-bold transition-all cursor-pointer ${
                      methodFilter === m
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {m} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Endpoint Rows List */}
          <div className="glass-card border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Discovered Endpoints ({filtered.length})</span>
              <span className="text-[11px] text-cyan-400">Click row to inspect parameters • Click Test to dispatch scan</span>
            </div>
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No endpoints match your active search or filter.
              </div>
            ) : (
              <div>
                {filtered.map((ep, i) => (
                  <EndpointRow key={`${ep.method}-${ep.path}-${i}`} endpoint={ep} onTestInDashboard={handleTestInDashboard} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
