// src/components/TestResultCard.tsx — Security test result card with telemetry breakdown & detail modal
import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  MinusCircle,
  Wrench,
  Check,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { TestResult, Severity } from '../types';
import { SeverityBadge, Modal, Button } from './ui';
import toast from 'react-hot-toast';

interface Props {
  testKey: string;
  result: TestResult;
}

const SCANNER_DESCRIPTIONS: Record<string, string> = {
  tls: 'Cryptographic protocol version, certificate trust chain validity, cipher suites, and expiry.',
  headers: 'Defense-in-depth response headers: HSTS, CSP, X-Content-Type-Options, and framing controls.',
  leakage: 'Exposed server banners, stack traces, internal paths, and debug metadata in payloads.',
  reputation: 'Cross-reference against global threat intelligence feeds and public reputation indices.',
};

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    color: 'text-safe',
    bg: 'bg-safe/10',
    border: 'border-safe/30',
    label: 'PASS',
    barColor: 'bg-safe',
  },
  fail: {
    icon: XCircle,
    color: 'text-critical',
    bg: 'bg-critical/10',
    border: 'border-critical/30',
    label: 'FAIL',
    barColor: 'bg-critical',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-high',
    bg: 'bg-high/10',
    border: 'border-high/30',
    label: 'WARNING',
    barColor: 'bg-high',
  },
  inconclusive: {
    icon: HelpCircle,
    color: 'text-muted',
    bg: 'bg-elevated',
    border: 'border-line',
    label: 'INCONCLUSIVE',
    barColor: 'bg-line-strong',
  },
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

export default function TestResultCard({ testKey, result }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const config =
    STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.inconclusive;
  const Icon = config.icon;
  const description = SCANNER_DESCRIPTIONS[testKey] || 'Security posture evaluation module.';

  const checkCounts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    let inconclusive = 0;

    for (const f of result.findings) {
      const st = String(f.status || '').toLowerCase();
      if (st === 'pass') passed++;
      else if (st === 'fail') failed++;
      else if (st === 'warning') warnings++;
      else inconclusive++;
    }

    return { passed, failed, warnings, inconclusive, total: result.findings.length };
  }, [result.findings]);

  const highestSeverity = useMemo<Severity | null>(() => {
    let top: Severity | null = null;
    let topScore = 0;

    for (const f of result.findings) {
      if (f.status === 'fail' || f.status === 'warning') {
        const sev = (f.severity as Severity) || 'informational';
        const score = SEVERITY_ORDER[sev] || 0;
        if (score > topScore) {
          topScore = score;
          top = sev;
        }
      }
    }
    return top;
  }, [result.findings]);

  const pct = Math.min(100, Math.max(0, (result.earned_points / (result.max_points || 1)) * 100));

  const handleCopyEvidence = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Detail copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <>
      <article className="aegis-panel transition-all duration-200 hover:border-forest/50 hover:shadow-md">
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={isModalOpen}
          aria-controls={`test-${testKey}-modal`}
          className="group flex cursor-pointer select-none flex-col gap-4 p-4 transition-colors hover:bg-canvas/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] sm:p-5 lg:flex-row lg:items-center"
          onClick={() => setIsModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsModalOpen(true);
            }
          }}
          id={`test-${testKey}`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${config.border} ${config.bg}`}>
              <Icon className={`h-5 w-5 ${config.color}`} aria-hidden="true" />
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-semibold tracking-tight text-ink">{result.name}</h3>
                {highestSeverity ? <SeverityBadge severity={highestSeverity} size="xs" /> : null}
              </div>

              <p className="max-w-2xl text-[12px] leading-relaxed text-muted">{description}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 font-mono text-[10px]">
                <span className="flex items-center gap-1 text-safe">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {checkCounts.passed} passed
                </span>
                {checkCounts.failed > 0 ? (
                  <span className="flex items-center gap-1 text-critical">
                    <XCircle className="h-3 w-3" aria-hidden="true" />
                    {checkCounts.failed} failed
                  </span>
                ) : null}
                {checkCounts.warnings > 0 ? (
                  <span className="flex items-center gap-1 text-high">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {checkCounts.warnings} warning
                  </span>
                ) : null}
                {checkCounts.inconclusive > 0 ? (
                  <span className="flex items-center gap-1 text-muted">
                    <MinusCircle className="h-3 w-3" aria-hidden="true" />
                    {checkCounts.inconclusive} n/a
                  </span>
                ) : null}
                <span className="text-muted">/{checkCounts.total} checks</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line pt-3 lg:justify-end lg:border-t-0 lg:pt-0">
            <div className="min-w-[96px]">
              <div className="flex items-baseline gap-1 font-mono">
                <span className={`text-[14px] font-semibold tabular-nums ${config.color}`}>
                  {result.earned_points.toFixed(0)}
                </span>
                <span className="text-[10px] text-muted">/ {result.max_points} pts</span>
                <span className="text-[9.5px] text-muted">({Math.round(pct)}%)</span>
              </div>
              <div className="mt-1.5 h-[3px] w-24 overflow-hidden rounded-full bg-line">
                <div className={`h-full ${config.barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            <span className={`shrink-0 rounded-[4px] border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${config.bg} ${config.color} ${config.border}`}>
              {config.label}
            </span>

            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted transition-colors group-hover:border-forest group-hover:text-ink">
              <span>Inspect</span>
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
      </article>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="3xl"
        title={
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${config.border} ${config.bg}`}>
              <Icon className={`h-5 w-5 ${config.color}`} aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-[17px] font-bold text-ink">{result.name}</span>
                <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${config.bg} ${config.color} ${config.border}`}>
                  {config.label}
                </span>
                {highestSeverity ? <SeverityBadge severity={highestSeverity} size="xs" /> : null}
              </div>
              <p className="mt-0.5 font-mono text-[11.5px] text-muted">
                Score: <strong className="text-ink">{result.earned_points.toFixed(0)}</strong> / {result.max_points} points ({Math.round(pct)}%)
              </p>
            </div>
          </div>
        }
        description={description}
      >
        <div id={`test-${testKey}-modal`} className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas p-3.5 shadow-xs">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">PASSED</span>
              <p className="mt-1 font-mono text-[16px] font-bold text-safe">{checkCounts.passed}</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3.5 shadow-xs">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">FAILED</span>
              <p className="mt-1 font-mono text-[16px] font-bold text-critical">{checkCounts.failed}</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3.5 shadow-xs">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">WARNINGS</span>
              <p className="mt-1 font-mono text-[16px] font-bold text-high">{checkCounts.warnings}</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3.5 shadow-xs">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">TOTAL CHECKS</span>
              <p className="mt-1 font-mono text-[16px] font-bold text-ink">{checkCounts.total}</p>
            </div>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                VERIFICATION CHECKLIST &amp; EVIDENCE
              </span>
              <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {result.findings.length} evaluated
              </span>
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas">
              {result.findings.map((finding, i) => {
                const findingStatus = String(finding.status || 'inconclusive').toLowerCase();
                const severity = finding.severity as Severity | undefined;
                const check =
                  (finding.check as string | undefined) ??
                  (finding.name as string | undefined) ??
                  'Security check';
                const detail =
                  (finding.detail as string | undefined) ??
                  (finding.evidence as string | undefined) ??
                  (finding.value as string | undefined);
                const rule = finding.rule as string | undefined;
                const remediation = finding.remediation as string | undefined;

                const isPass = findingStatus === 'pass';
                const isFail = findingStatus === 'fail';
                const isWarn = findingStatus === 'warning';
                const isNA =
                  findingStatus === 'not_applicable' ||
                  findingStatus === 'inconclusive' ||
                  findingStatus === 'skipped';

                return (
                  <li key={i} className="p-4 sm:p-5 transition-colors hover:bg-elevated/40">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {isPass ? (
                          <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-safe" aria-hidden="true" />
                        ) : isFail ? (
                          <XCircle className="h-4.5 w-4.5 shrink-0 text-critical" aria-hidden="true" />
                        ) : isWarn ? (
                          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-high" aria-hidden="true" />
                        ) : (
                          <MinusCircle className="h-4.5 w-4.5 shrink-0 text-muted" aria-hidden="true" />
                        )}
                        <span className="text-[13.5px] font-semibold text-ink leading-tight">{check}</span>
                        {rule ? (
                          <span className="shrink-0 rounded border border-line bg-paper px-2 py-0.5 font-mono text-[9.5px] text-muted">
                            {rule}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                        {severity ? <SeverityBadge severity={severity} size="xs" /> : null}
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                            isPass
                              ? 'border-safe/30 bg-safe/10 text-safe'
                              : isFail
                                ? 'border-critical/30 bg-critical/10 text-critical'
                                : isWarn
                                  ? 'border-high/30 bg-high/10 text-high'
                                  : 'border-line bg-paper text-muted'
                          }`}
                        >
                          {isNA ? 'N/A' : findingStatus}
                        </span>
                      </div>
                    </div>

                    {detail ? (
                      <div className="relative mt-3 pl-7">
                        <pre className="max-h-56 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-paper p-3.5 pr-12 font-mono text-[11px] leading-relaxed text-ink select-all">
                          {String(detail)}
                        </pre>
                        <button
                          type="button"
                          onClick={() => handleCopyEvidence(String(detail), `finding-${i}`)}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-elevated text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                          title="Copy detail"
                          aria-label="Copy finding detail"
                        >
                          {copiedKey === `finding-${i}` ? (
                            <Check className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    ) : null}

                    {remediation ? (
                      <div className="mt-3 ml-7 rounded-xl border-l-2 border-l-forest bg-forest/5 p-3.5 text-[12px] leading-relaxed text-muted">
                        <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-forest">
                          <Wrench className="h-3 w-3" aria-hidden="true" />
                          Remediation
                        </p>
                        <p className="mt-1 text-ink">{remediation}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {result.recommendations.length > 0 ? (
            <section className="rounded-2xl border border-line bg-elevated/70 p-4 sm:p-5">
              <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-forest">
                Security recommendations
              </p>
              <ul className="mt-2.5 space-y-2">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-forest" aria-hidden="true" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Close details
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
