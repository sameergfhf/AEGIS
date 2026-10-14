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
  scan,
}: {
  context: OperationContext;
  scan: Scan;
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
  const { specId, baseUrl, specUrl, endpoint, specTitle, specVersion, specAnalysis } = state;

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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* Back navigation */}
      <button
        onClick={() => navigate('/spec', { state: { restoredAnalysis: specAnalysis } })}
        className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors text-sm"
      >
        <ArrowLeft size={16} />
        Back to {specTitle ?? 'Spec Analyzer'}
      </button>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Security Test — Single Endpoint</h1>
        <p className="text-sm text-slate-400">
          Running the four security checks against a single operation from the imported specification.
          Only this endpoint is scanned.
        </p>
      </div>

      {/* Operation card */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur p-6 space-y-5">

        {/* Method + Path */}
        <div>
          <SectionHeader icon={<FileCode size={16} />} title="Selected Operation" />
          <div className="flex flex-wrap items-center gap-3">
            <MethodBadge method={endpoint.method} />
            <code className="text-base text-slate-100 font-mono">{endpoint.path}</code>
            {endpoint.deprecated && (
              <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">DEPRECATED</span>
            )}
          </div>
          {endpoint.summary && (
            <p className="mt-2 text-sm text-slate-400">{endpoint.summary}</p>
          )}
          {endpoint.description && endpoint.description !== endpoint.summary && (
            <p className="mt-1 text-xs text-slate-500">{endpoint.description}</p>
          )}
        </div>

        {/* Base URL — editable; required to be absolute */}
        <div>
          <SectionHeader icon={<ExternalLink size={16} />} title="Base URL" />
          <div className="space-y-1">
            <input
              id="base-url-input"
              type="url"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.example.com"
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono text-slate-200
                bg-slate-900/60 placeholder-slate-500
                focus:outline-none focus:ring-1 focus:ring-cyan-500/30
                ${
                  baseUrlError
                    ? 'border-amber-500/50 focus:border-amber-500/70'
                    : 'border-slate-600/50 focus:border-cyan-500/50'
                }`}
            />
            {baseUrlError ? (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle size={11} /> {baseUrlError}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Full URL: <code className="text-cyan-400">{baseUrlInput}{endpoint.path}</code>
              </p>
            )}
            {/* Hint when spec has a relative server URL */}
            {baseUrl && !baseUrl.startsWith('http') && (
              <p className="text-xs text-slate-500">
                The imported spec defines a relative base URL{' '}
                <code className="text-slate-400">{baseUrl}</code>. Enter the full hostname above.
              </p>
            )}
          </div>
        </div>

        {/* Auth requirements */}
        {endpoint.auth_schemes.length > 0 && (
          <div>
            <SectionHeader icon={<Key size={16} />} title="Authentication Required" />
            <div className="flex flex-wrap gap-2">
              {endpoint.auth_schemes.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300"
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
            <SectionHeader icon={<CheckCircle size={16} />} title="Documented Responses" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(endpoint.responses).map(([code, resp]) => (
                <div
                  key={code}
                  className="text-xs px-2 py-1 rounded border border-slate-600/50 bg-slate-700/30"
                >
                  <span
                    className={
                      code.startsWith('2')
                        ? 'text-emerald-400'
                        : code.startsWith('4')
                        ? 'text-amber-400'
                        : code.startsWith('5')
                        ? 'text-red-400'
                        : 'text-slate-300'
                    }
                  >
                    {code}
                  </span>
                  {(resp as { description?: string }).description && (
                    <span className="text-slate-400 ml-1">
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
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur p-6 space-y-5">

        {/* Path parameters */}
        {pathParams.length > 0 && (
          <div>
            <SectionHeader icon={<ChevronRight size={16} />} title="Path Parameters" />
            <div className="space-y-3">
              {pathParams.map((param) => (
                <div key={param}>
                  <label className="block text-xs text-slate-400 mb-1">
                    <code className="text-cyan-400">{`{${param}}`}</code>
                    <span className="text-red-400 ml-1">*required</span>
                  </label>
                  <input
                    type="text"
                    value={paramValues[param] ?? ''}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [param]: e.target.value }))
                    }
                    placeholder={`Enter value for ${param}`}
                    className="w-full max-w-sm rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase()) && (
          <div>
            <SectionHeader icon={<FileCode size={16} />} title="Request Body (JSON)" />
            {endpoint.request_body && (
              <details className="mb-2">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300 select-none">
                  View documented schema
                </summary>
                <pre className="mt-2 text-xs text-slate-400 bg-slate-900/60 rounded p-3 overflow-x-auto">
                  {JSON.stringify(endpoint.request_body, null, 2)}
                </pre>
              </details>
            )}
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={'{\n  "name": "example"\n}'}
              rows={6}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 resize-y"
            />
            {bodyError && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} /> {bodyError}
              </p>
            )}
          </div>
        )}

        {/* Auth header */}
        <div>
          <button
            onClick={() => setShowAuth((v) => !v)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <Key size={14} />
            {showAuth ? 'Hide' : 'Add'} authorization header (optional)
            <ChevronDown
              size={14}
              className={`transition-transform ${showAuth ? 'rotate-180' : ''}`}
            />
          </button>
          {showAuth && (
            <div className="mt-3">
              <label className="block text-xs text-slate-500 mb-1">
                Value for <code>Authorization</code> header — not stored
              </label>
              <input
                type="password"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Bearer eyJhbGci..."
                className="w-full rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
              />
              <p className="mt-1 text-xs text-slate-500">
                This value is forwarded to the API only and is never written to the database or logs.
              </p>
            </div>
          )}
        </div>

        {/* Destructive confirmation */}
        {isDestructive && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-300 mb-1">
                  {endpoint.method.toUpperCase()} — Potentially Destructive Operation
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  This operation can create, modify, or delete data on the target server. Only
                  proceed if you have explicit authorization to test this endpoint.
                </p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded border-red-500/50 text-red-500 focus:ring-red-500/30"
                  />
                  <span className="text-sm text-red-300">
                    I have authorization to test this endpoint and understand the risks
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Missing params warning */}
        {missingParams.length > 0 && (
          <p className="text-xs text-amber-400 flex items-center gap-1">
            <AlertTriangle size={12} />
            Fill in required path parameters:{' '}
            {missingParams.map((p) => <code key={p} className="mx-0.5">{`{${p}}`}</code>)}
          </p>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all
            bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20
            hover:shadow-cyan-500/40 hover:scale-[1.02]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
        >
          {scanning ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Running Security Tests…
            </>
          ) : (
            <>
              <Play size={16} />
              Run Security Tests
            </>
          )}
        </button>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-300 mb-1">Scan failed</p>
            {/* whitespace-pre-line so field:message lines render on separate rows */}
            <p className="text-sm text-slate-400 whitespace-pre-line break-words">{error}</p>
          </div>
        </div>
      )}


      {/* ── Scanning / pending state ──────────────────────────────────────── */}
      {scanning && scan && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-6 flex items-center gap-4">
          <Loader2 size={24} className="text-cyan-400 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Running security tests…</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Status: <span className="capitalize text-cyan-400">{scan.status}</span> — polling for results
            </p>
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {scan?.status === 'completed' && (
        <div className="space-y-6">

          {/* Operation context banner */}
          {operationContext && (
            <OperationContextBanner context={operationContext} scan={scan} />
          )}

          {/* Score */}
          <ScoreCard scan={scan} />

          {/* Test results */}
          {testResults && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Security Test Results</h2>
              {Object.values(testResults).map((result: unknown) => (
                <TestResultCard
                  key={(result as { name: string }).name}
                  result={result as Parameters<typeof TestResultCard>[0]['result']}
                />
              ))}
            </div>
          )}

          {/* Scan meta */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-4 text-xs text-slate-500 flex flex-wrap gap-x-6 gap-y-1">
            <span>Scan ID: <code className="text-slate-400">{scan.id}</code></span>
            {scan.duration_ms && (
              <span>Duration: <span className="text-slate-400">{(scan.duration_ms / 1000).toFixed(1)}s</span></span>
            )}
            <span>
              <a
                href={`/api/scans/${scan.id}/report`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <ExternalLink size={11} /> Download PDF Report
              </a>
            </span>
          </div>
        </div>
      )}

      {/* Failed scan */}
      {scan?.status === 'failed' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-sm font-medium text-red-300 mb-1">Scan could not be completed</p>
          <p className="text-sm text-slate-400">{scan.error_message ?? 'An error occurred during scanning.'}</p>
        </div>
      )}
    </div>
  );
}
