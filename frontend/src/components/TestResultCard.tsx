// src/components/TestResultCard.tsx — Individual security test result card

import { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { TestResult } from '../types';

interface Props {
  testKey: string;
  result: TestResult;
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'PASS' },
  fail: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'FAIL' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'WARNING' },
  inconclusive: { icon: HelpCircle, color: 'text-slate-400', bg: 'bg-slate-700/40', border: 'border-slate-600/40', label: 'INCONCLUSIVE' },
};

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'severity-critical',
  high: 'severity-high',
  medium: 'severity-medium',
  low: 'severity-low',
  informational: 'severity-informational',
};

export default function TestResultCard({ testKey, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.inconclusive;
  const Icon = config.icon;

  const failedFindings = result.findings.filter(
    (f) => f.status === 'fail' || f.status === 'warning',
  );

  return (
    <div className={`glass-card border ${config.border} fade-in overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
        id={`test-${testKey}`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${config.bg}`}>
            <Icon className={`w-4.5 h-4.5 ${config.color}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{result.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {failedFindings.length > 0
                ? `${failedFindings.length} issue${failedFindings.length !== 1 ? 's' : ''} found`
                : 'No issues found'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Points */}
          <div className="text-right">
            <div className={`text-lg font-bold ${config.color}`}>
              {result.earned_points.toFixed(0)}
            </div>
            <div className="text-xs text-slate-500">/ {result.max_points} pts</div>
          </div>

          {/* Status badge */}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
            {config.label}
          </span>

          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Points bar */}
      <div className="h-1 bg-slate-800/60">
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${(result.earned_points / result.max_points) * 100}%`,
            background: `${config.color === 'text-green-400' ? '#22c55e' : config.color === 'text-red-400' ? '#ef4444' : config.color === 'text-yellow-400' ? '#eab308' : '#6b7280'}`,
          }}
        />
      </div>

      {/* Expanded findings */}
      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-slate-700/50 space-y-3">
          {result.findings.map((finding, i) => {
            const findingStatus = finding.status as string;
            const severity = finding.severity as string | undefined;
            const check = (finding.check as string | undefined) ?? (finding.name as string | undefined) ?? 'Check';
            const detail = (finding.detail as string | undefined) ?? (finding.evidence as string | undefined);

            return (
              <div key={i} className="bg-slate-800/40 rounded-lg p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-slate-200 font-medium">{check}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {severity && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${SEVERITY_CLASSES[severity] || 'severity-informational'}`}>
                        {severity}
                      </span>
                    )}
                    <span className={`text-xs font-medium status-${findingStatus}`}>
                      {findingStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
                {detail && (
                  <p className="text-xs text-slate-400 leading-relaxed">{String(detail).slice(0, 400)}</p>
                )}
                {finding.remediation && (
                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <p className="text-xs text-cyan-400/80">
                      <span className="font-medium text-cyan-400">Fix: </span>
                      {String(finding.remediation).slice(0, 300)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {result.recommendations.length > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-400 mb-1.5">Recommendations</p>
              {result.recommendations.map((rec, i) => (
                <p key={i} className="text-xs text-slate-400 leading-relaxed mb-1">• {rec}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
