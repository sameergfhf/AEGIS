// src/components/TestResultCard.tsx — Individual security test result card

import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, ChevronDown, Wrench, ShieldAlert } from 'lucide-react';
import type { TestResult } from '../types';

interface Props {
  testKey: string;
  result: TestResult;
}

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/10',
    label: 'PASS',
    barColor: 'from-emerald-500 to-teal-400',
  },
  fail: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/10',
    label: 'FAIL',
    barColor: 'from-red-500 to-rose-400',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/10',
    label: 'WARNING',
    barColor: 'from-amber-500 to-yellow-400',
  },
  inconclusive: {
    icon: HelpCircle,
    color: 'text-slate-400',
    bg: 'bg-slate-800/80',
    border: 'border-slate-700/60',
    glow: 'shadow-transparent',
    label: 'INCONCLUSIVE',
    barColor: 'from-slate-600 to-slate-500',
  },
};

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  informational: 'text-slate-400 bg-slate-800 border-slate-700',
};

export default function TestResultCard({ testKey, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.inconclusive;
  const Icon = config.icon;

  const failedFindings = result.findings.filter(
    (f) => f.status === 'fail' || f.status === 'warning',
  );

  const pct = Math.min(100, Math.max(0, (result.earned_points / (result.max_points || 1)) * 100));

  return (
    <div className={`glass-card glow-card-hover border ${config.border} rounded-2xl overflow-hidden transition-all duration-200 shadow-lg ${config.glow}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4.5 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
        id={`test-${testKey}`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl border ${config.border} ${config.bg} shrink-0`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white tracking-tight truncate">{result.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>{failedFindings.length > 0 ? `${failedFindings.length} issue${failedFindings.length !== 1 ? 's' : ''} detected` : 'Observed standards met'}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-500">{result.findings.length} checks performed</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Points score */}
          <div className="text-right">
            <div className={`text-base font-bold font-mono ${config.color}`}>
              {result.earned_points.toFixed(0)}
              <span className="text-xs text-slate-500 font-normal"> / {result.max_points} pts</span>
            </div>
          </div>

          {/* Status badge */}
          <span className={`text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-lg border font-mono ${config.bg} ${config.color} ${config.border}`}>
            {config.label}
          </span>

          <div className="p-1 rounded-lg bg-slate-800/40 text-slate-400">
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180 text-cyan-400' : ''}`} />
          </div>
        </div>
      </div>

      {/* Points Progress Gauge */}
      <div className="h-1 bg-slate-900/90 w-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${config.barColor} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Expanded findings & remediations */}
      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-slate-800/80 bg-slate-950/40 space-y-3.5 animate-fade-in">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            <span>Detailed Check Telemetry</span>
            <span className="text-slate-500 font-mono text-[11px]">{result.findings.length} Items</span>
          </div>

          {result.findings.map((finding, i) => {
            const findingStatus = finding.status as string;
            const severity = finding.severity as string | undefined;
            const check = (finding.check as string | undefined) ?? (finding.name as string | undefined) ?? 'Check';
            const detail = (finding.detail as string | undefined) ?? (finding.evidence as string | undefined);

            const isFail = findingStatus === 'fail';
            const isWarn = findingStatus === 'warning';

            return (
              <div
                key={i}
                className={`p-4 rounded-xl border transition-all space-y-2 ${
                  isFail
                    ? 'bg-red-500/5 border-red-500/20'
                    : isWarn
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-slate-900/60 border-slate-800/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    {isFail ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    ) : isWarn ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span>{check}</span>
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {severity && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${SEVERITY_CLASSES[severity] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                        {severity}
                      </span>
                    )}
                    <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                      isFail
                        ? 'text-red-400 bg-red-500/10'
                        : isWarn
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-emerald-400 bg-emerald-500/10'
                    }`}>
                      {findingStatus.toUpperCase()}
                    </span>
                  </div>
                </div>

                {detail && (
                  <p className="text-xs text-slate-400 leading-relaxed font-mono bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 break-words">
                    {String(detail).slice(0, 450)}
                  </p>
                )}

                {Boolean(finding.remediation) && (
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Prescribed Remediation</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {String(finding.remediation)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {result.recommendations.length > 0 && (
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <ShieldAlert className="w-4 h-4" />
                <span>Security Recommendations</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
