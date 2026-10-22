// src/pages/OperationScan.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Operation Scan page — launched from the Spec Analyzer when the user clicks
// "Test in Dashboard" on an individual endpoint.
//
// Flow:
//   1. Display the selected operation's metadata (method, path, summary, auth)
//   2. Collect required path parameters via an inline form
//   3. Optionally collect auth header (not persisted)
//   4. Show a confirmation dialog for destructive methods
//   5. POST to /api/scans/operation, then poll until complete
//   6. Render results using existing ScoreCard, TestResultCard components
//   7. "← Back to Analyzer" preserves the imported spec state

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode,
  Key,
  Loader2,
  Play,
  ShieldCheck,
  Tag,
} from 'lucide-react';

import type { EndpointInfo, OperationContext, OperationScanRequest, Scan, SpecAnalysis } from '../types';
import { getScan, getErrorMessage, scanOperation } from '../services/api';
import ScoreCard from '../components/ScoreCard';
import TestResultCard from '../components/TestResultCard';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 80; // 2 min

const DESTRUCTIVE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  PUT: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  PATCH: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HEAD: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  OPTIONS: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

// ── Location state shape (sent from SpecAnalyzer) ─────────────────────────────

export interface OperationScanLocationState {
  specId: string;
  baseUrl: string;       // from analysis.base_url — may be relative (e.g. /api/v3)
  specUrl: string;      // the URL the user typed in SpecAnalyzer (always absolute if set)
  endpoint: EndpointInfo;
  specTitle?: string;
  specVersion?: string;
  specAnalysis: SpecAnalysis; // full spec for back-navigation
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

function MethodBadge({ method }: { method: string }) {
  const cls = METHOD_COLORS[method.toUpperCase()] ?? METHOD_COLORS.GET;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider ${cls}`}>
      {method.toUpperCase()}
    </span>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-cyan-400">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
    </div>
  );
}

// ── Operation Context Banner ──────────────────────────────────────────────────

function OperationContextBanner({
  context,
}: {
  context: OperationContext;
  scan?: Scan;
}) {
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileCode size={20} className="text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MethodBadge method={context.method} />
              <code className="text-sm text-slate-200 font-mono">{context.resolved_path}</code>
            </div>
            {context.summary && (
              <p className="text-sm text-slate-400">{context.summary}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {context.spec_title && (
                <span className="flex items-center gap-1 text-xs text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  <Tag size={10} /> {context.spec_title}
                  {context.spec_version && ` v${context.spec_version}`}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <ShieldCheck size={10} /> Selected Endpoint Scan
              </span>
              {context.deprecated && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  ⚠ Deprecated
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OperationScan() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as OperationScanLocationState | null;

  // ── Guard: must arrive with state from SpecAnalyzer ──────────────────────
  useEffect(() => {
    if (!state?.specId || !state?.endpoint) {
      navigate('/spec', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.specId || !state?.endpoint) {
    return null;
  }

  return <OperationScanInner state={state} />;
}

function OperationScanInner({ state }: { state: OperationScanLocationState }) {
  const navigate = useNavigate();
  const { specId, baseUrl, specUrl, endpoint, specTitle, specAnalysis } = state;

  // ── Base URL (editable) ────────────────────────────────────────────────────
  // Specs often list a relative server URL like /api/v3. When that happens we
  // try to infer the host from the URL the user typed in SpecAnalyzer, and
  // always let the user correct it before running.
  const [baseUrlInput, setBaseUrlInput] = useState<string>(() => {
    if (baseUrl?.startsWith('http://') || baseUrl?.startsWith('https://')) {
      return baseUrl;
    }
    // Relative base_url from spec — try to build an absolute URL from specUrl
    if (specUrl) {
      try {
        const u = new URL(specUrl);
        const host = `${u.protocol}//${u.host}`;
        // Append the relative path from the spec, but not if it duplicates specUrl's path
        const relativePart = baseUrl?.startsWith('/') ? baseUrl : '';
        return `${host}${relativePart}`;
      } catch { /* ignore */ }
    }
    return '';
  });

  const baseUrlError =
    baseUrlInput.trim() === ''
      ? 'Required — enter the full base URL (e.g. https://petstore3.swagger.io/api/v3)'
      : !baseUrlInput.startsWith('http://') && !baseUrlInput.startsWith('https://')
      ? "Must start with 'http://' or 'https://'"
      : '';

  // ── Path params ────────────────────────────────────────────────────────────
  const pathParams = useMemo(() => extractPathParams(endpoint.path), [endpoint.path]);
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pathParams.map((p) => [p, '']))
  );

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authHeader, setAuthHeader] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  // ── Request body ───────────────────────────────────────────────────────────
  const [bodyText, setBodyText] = useState('');
  const [bodyError, setBodyError] = useState('');

  // ── Destructive confirmation ───────────────────────────────────────────────
  const isDestructive = DESTRUCTIVE_METHODS.has(endpoint.method.toUpperCase());
  const [confirmed, setConfirmed] = useState(false);

  // ── Scan state ─────────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<Scan | null>(null);
  const [operationContext, setOperationContext] = useState<OperationContext | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (scanId: string) => {
      pollCount.current = 0;
      pollRef.current = setInterval(async () => {
        pollCount.current += 1;
        if (pollCount.current > MAX_POLL_ATTEMPTS) {
          stopPolling();
          setError('Scan timed out. The server may be under load. Please retry.');
          setScanning(false);
          return;
        }
        try {
          const updated = await getScan(scanId);
          setScan(updated);
          if (updated.status === 'completed' || updated.status === 'failed') {
            stopPolling();
            setScanning(false);
            // Extract operation_context from result_json
            if (updated.result_json) {
              try {
                const parsed = JSON.parse(updated.result_json);
                if (parsed.operation_context?.from_spec) {
                  setOperationContext(parsed.operation_context as OperationContext);
                }
              } catch {
                // ignore parse error
              }
            }
          }
        } catch {
          // transient — keep polling
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  // ── Parse + validate request body ─────────────────────────────────────────
  const parsedBody = useMemo(() => {
    if (!bodyText.trim()) return null;
    try {
      const obj = JSON.parse(bodyText);
      setBodyError('');
      return obj as Record<string, unknown>;
    } catch {
      setBodyError('Invalid JSON — fix before running.');
      return null;
    }
  }, [bodyText]);

  // ── Readiness checks ───────────────────────────────────────────────────────
  const missingParams = pathParams.filter((p) => !paramValues[p]?.trim());
  const canRun =
    !scanning &&
    !baseUrlError &&
    missingParams.length === 0 &&
    (!isDestructive || confirmed) &&
    (!bodyText.trim() || !bodyError);

  // ── Run handler ────────────────────────────────────────────────────────────
  const handleRun = async () => {
    setError('');
    setScan(null);
    setOperationContext(null);
    setScanning(true);

    const req: OperationScanRequest = {
      spec_id: specId,
      path: endpoint.path,
      method: endpoint.method,
      base_url: baseUrlInput.trim().replace(/\/+$/, ''), // always strip trailing slash
      path_params: paramValues,
      confirm_destructive: confirmed,
    };
    if (authHeader.trim()) req.auth_header = authHeader.trim();
    if (parsedBody) req.request_body = parsedBody;

    try {
      const stub = await scanOperation(req);
      setScan(stub);
      startPolling(stub.id);
    } catch (err) {
      setError(getErrorMessage(err));
      setScanning(false);
    }
  };

  // ── Extract test results from completed scan ───────────────────────────────
  const testResults = useMemo(() => {
    if (!scan?.result_json) return null;
    try {
      const parsed = JSON.parse(scan.result_json);
      return parsed.test_results ?? null;
    } catch {
      return null;
    }
  }, [scan?.result_json]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/spec', { state: { restoredAnalysis: specAnalysis } })}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 hover:text-cyan-400 border border-slate-800 hover:border-slate-700 transition-all text-xs font-medium group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        Back to {specTitle ?? 'Spec Analyzer'}
      </button>

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Target Endpoint Security Probe</h1>
          <p className="text-sm text-slate-400">
            Execute the 4 observable security pillars against a specific operation from your OpenAPI specification.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
          <ShieldCheck size={14} />
          <span>Isolated Probe Mode</span>
        </div>
      </div>

      {/* Operation card */}
      <div className="glass-card glow-card-hover border border-slate-700/60 rounded-2xl p-6 md:p-7 space-y-6">

        {/* Method + Path */}
        <div>
          <SectionHeader icon={<FileCode size={16} />} title="Target Operation" />
          <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <MethodBadge method={endpoint.method} />
            <code className="text-base text-cyan-300 font-mono font-semibold">{endpoint.path}</code>
            {endpoint.deprecated && (
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                DEPRECATED
              </span>
            )}
          </div>
          {endpoint.summary && (
            <p className="mt-2.5 text-sm text-slate-300 font-medium">{endpoint.summary}</p>
          )}
          {endpoint.description && endpoint.description !== endpoint.summary && (
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">{endpoint.description}</p>
          )}
        </div>

        {/* Base URL — editable; required to be absolute */}
        <div>
          <SectionHeader icon={<ExternalLink size={16} />} title="Target Host & Base URL" />
          <div className="space-y-1.5">
            <div className="relative">
              <input
                id="base-url-input"
                type="url"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://api.example.com"
                className={`w-full rounded-xl border px-4 py-2.5 text-sm font-mono text-slate-200
                  bg-slate-900/80 placeholder-slate-500 transition-all
                  focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  ${
                    baseUrlError
                      ? 'border-amber-500/50 focus:border-amber-500/80'
                      : 'border-slate-700/70 focus:border-cyan-500/60'
                  }`}
              />
            </div>
            {baseUrlError ? (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 pt-0.5">
                <AlertTriangle size={13} /> {baseUrlError}
              </p>
            ) : (
              <p className="text-xs text-slate-400 pt-0.5">
                Target Endpoint: <code className="text-cyan-400 font-mono">{baseUrlInput}{endpoint.path}</code>
              </p>
            )}
            {/* Hint when spec has a relative server URL */}
            {baseUrl && !baseUrl.startsWith('http') && (
              <p className="text-xs text-slate-500">
                The imported spec defines a relative base URL{' '}
                <code className="text-slate-400 font-mono">{baseUrl}</code>. Enter the full hostname above.
              </p>
            )}
          </div>
        </div>

        {/* Auth requirements */}
        {endpoint.auth_schemes.length > 0 && (
          <div>
            <SectionHeader icon={<Key size={16} />} title="Declared Authentication Requirements" />
            <div className="flex flex-wrap gap-2">
              {endpoint.auth_schemes.map((s) => (
                <span
                  key={s}
                  className="text-xs font-mono px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 font-semibold"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Expected responses */}
        {Object.keys(endpoint.responses).length > 0 && (
          <div>
            <SectionHeader icon={<CheckCircle size={16} />} title="Documented Response Contracts" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(endpoint.responses).map(([code, resp]) => (
                <div
                  key={code}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-700/70 bg-slate-900/60"
                >
                  <span
                    className={`font-mono font-bold ${
                      code.startsWith('2')
                        ? 'text-emerald-400'
                        : code.startsWith('4')
                        ? 'text-amber-400'
                        : code.startsWith('5')
                        ? 'text-red-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {code}
                  </span>
                  {(resp as { description?: string }).description && (
                    <span className="text-slate-400 ml-1.5">
                      — {(resp as { description: string }).description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Input section ─────────────────────────────────────────────────── */}
      <div className="glass-card glow-card-hover border border-slate-700/60 rounded-2xl p-6 md:p-7 space-y-6">

        {/* Path parameters */}
        {pathParams.length > 0 && (
          <div>
            <SectionHeader icon={<ChevronRight size={16} />} title="Dynamic Path Parameters" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {pathParams.map((param) => (
                <div key={param} className="space-y-1">
                  <label className="block text-xs text-slate-300 font-medium">
                    <code className="text-cyan-400 font-mono">{`{${param}}`}</code>
                    <span className="text-red-400 ml-1.5 text-[11px]">*required</span>
                  </label>
                  <input
                    type="text"
                    value={paramValues[param] ?? ''}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [param]: e.target.value }))
                    }
                    placeholder={`Value for ${param}`}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 font-mono focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase()) && (
          <div>
            <SectionHeader icon={<FileCode size={16} />} title="Request Body Payload (JSON)" />
            {endpoint.request_body && (
              <details className="mb-2">
                <summary className="text-xs text-cyan-400 cursor-pointer hover:text-cyan-300 select-none font-medium">
                  ▸ Inspect documented schema definition
                </summary>
                <pre className="mt-2 text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto font-mono">
                  {JSON.stringify(endpoint.request_body, null, 2)}
                </pre>
              </details>
            )}
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={'{\n  "name": "example"\n}'}
              rows={5}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3.5 py-2.5 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-y"
            />
            {bodyError && (
              <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {bodyError}
              </p>
            )}
          </div>
        )}

        {/* Auth header */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            onClick={() => setShowAuth((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider"
          >
            <Key size={14} className="text-cyan-400" />
            {showAuth ? 'Hide' : 'Add'} Optional Authorization Header
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${showAuth ? 'rotate-180' : ''}`}
            />
          </button>
          {showAuth && (
            <div className="mt-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
              <label className="block text-xs text-slate-400 font-medium">
                Authorization Header Value <span className="text-slate-500">(Never written to DB or logs)</span>
              </label>
              <input
                type="password"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Bearer eyJhbGci..."
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/80 px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                This token is dispatched strictly in ephemeral memory during test execution and scrubbed from all scan reports.
              </p>
            </div>
          )}
        </div>

        {/* Destructive confirmation */}
        {isDestructive && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4.5">
            <div className="flex items-start gap-3.5">
              <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-red-300">
                    {endpoint.method.toUpperCase()} — Potentially State-Modifying Operation
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Executing this method may create, overwrite, or delete data on the remote target. Confirm authorization before continuing.
                  </p>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded border-red-500/50 text-red-500 focus:ring-red-500/30 accent-red-500"
                  />
                  <span className="text-xs font-medium text-red-300">
                    I have explicit authorization to test this endpoint and acknowledge state-mutation risks
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Missing params warning */}
        {missingParams.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 rounded-xl">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              Required parameters missing:{' '}
              {missingParams.map((p) => <code key={p} className="mx-1 font-mono font-bold text-amber-300">{`{${p}}`}</code>)}
            </span>
          </div>
        )}

        {/* Run button */}
        <div className="pt-2">
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="flex items-center justify-center gap-2.5 w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm transition-all
              bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/25
              hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
          >
            {scanning ? (
              <>
                <Loader2 size={16} className="animate-spin text-white" />
                <span>Dispatching Security Probes…</span>
              </>
            ) : (
              <>
                <Play size={16} className="fill-white" />
                <span>Execute Operation Security Scan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 flex items-start gap-3.5 animate-shake">
          <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-300 mb-1">Scan Execution Halted</p>
            <p className="text-xs text-slate-300 whitespace-pre-line break-words leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* ── Scanning / pending state ──────────────────────────────────────── */}
      {scanning && scan && (
        <div className="glass-card border border-cyan-500/40 bg-cyan-500/5 p-6 rounded-2xl flex items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Analyzing Target Endpoint Observable Signals…</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluating TLS 1.3 handshake, header compliance, secret leakage, and reputation indices.
            </p>
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {scan?.status === 'completed' && (
        <div className="space-y-6 animate-fade-in">

          {/* Operation context banner */}
          {operationContext && (
            <OperationContextBanner context={operationContext} scan={scan} />
          )}

          {/* Score */}
          <ScoreCard scan={scan} />

          {/* Test results */}
          {testResults && (
            <div className="space-y-3.5">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <span>Observable Security Findings</span>
              </h2>
              {Object.entries(testResults).map(([key, result]) => (
                <TestResultCard
                  key={key}
                  testKey={key}
                  result={result as Parameters<typeof TestResultCard>[0]['result']}
                />
              ))}
            </div>
          )}

          {/* Scan meta & PDF export footer */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span>Scan ID: <code className="text-cyan-400 font-mono">{scan.id.slice(0, 8)}...</code></span>
              {scan.duration_ms && (
                <span>Duration: <span className="text-slate-200 font-mono">{(scan.duration_ms / 1000).toFixed(1)}s</span></span>
              )}
            </div>
            <a
              href={`/api/scans/${scan.id}/report`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-colors"
            >
              <ExternalLink size={12} />
              <span>Download Executive PDF Report</span>
            </a>
          </div>
        </div>
      )}

      {/* Failed scan */}
      {scan?.status === 'failed' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-sm font-semibold text-red-300 mb-1">Target Assessment Failed</p>
          <p className="text-xs text-slate-400">{scan.error_message ?? 'An error occurred during scanning.'}</p>
        </div>
      )}
    </div>
  );
}

