// src/components/ScoreCard.tsx — Security Assessment Score display

import type { Scan } from '../types';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Clock, AlertOctagon } from 'lucide-react';

interface Props {
  scan: Scan;
}

function getScoreColor(score?: number): string {
  if (score === undefined || score === null) return '#6b7280';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function getScoreLabel(score?: number): string {
  if (score === undefined || score === null) return 'Insufficient Data';
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

const SEVERITY_ICONS: Record<string, { icon: React.ComponentType<{className?: string}>, color: string }> = {
  critical: { icon: AlertOctagon, color: 'text-red-400' },
  high: { icon: AlertTriangle, color: 'text-orange-400' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400' },
  low: { icon: AlertTriangle, color: 'text-blue-400' },
};

export default function ScoreCard({ scan }: Props) {
  const score = scan.assessment_score;
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const circumference = 2 * Math.PI * 40; // radius=40
  const dashOffset = score !== undefined && score !== null
    ? circumference * (1 - score / 100)
    : circumference;

  const SeverityIcon = scan.highest_severity
    ? (SEVERITY_ICONS[scan.highest_severity]?.icon ?? HelpCircle)
    : null;
  const severityColor = scan.highest_severity
    ? (SEVERITY_ICONS[scan.highest_severity]?.color ?? 'text-slate-400')
    : 'text-slate-400';

  const duration = scan.duration_ms
    ? scan.duration_ms >= 1000
      ? `${(scan.duration_ms / 1000).toFixed(1)}s`
      : `${Math.round(scan.duration_ms)}ms`
    : null;

  return (
    <div className="glass-card glow-cyan p-6 fade-in">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Security Assessment Score</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Based on {scan.assessed_points?.toFixed(0) ?? 0} / 100 assessed points
          </p>
        </div>
        {duration && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {duration}
          </div>
        )}
      </div>

      <div className="flex items-center gap-8">
        {/* Score ring */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50" cy="50" r="40"
              fill="none" stroke="rgba(71,85,105,0.4)" strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: scoreColor }}>
              {score !== undefined && score !== null ? Math.round(score) : '—'}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">{scoreLabel}</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          <StatItem
            icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            label="Passed"
            value={scan.passed_checks}
            valueClass="text-green-400"
          />
          <StatItem
            icon={<XCircle className="w-4 h-4 text-red-400" />}
            label="Failed"
            value={scan.failed_checks}
            valueClass="text-red-400"
          />
          <StatItem
            icon={<AlertTriangle className="w-4 h-4 text-yellow-400" />}
            label="Warnings"
            value={scan.warning_checks}
            valueClass="text-yellow-400"
          />
          <StatItem
            icon={<HelpCircle className="w-4 h-4 text-slate-400" />}
            label="Inconclusive"
            value={scan.inconclusive_checks}
            valueClass="text-slate-400"
          />
        </div>
      </div>

      {/* Coverage and highest severity */}
      <div className="mt-4 flex items-center gap-4 pt-4 border-t border-slate-700/50">
        <div className="flex-1">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Assessment Coverage</span>
            <span className="text-slate-300 font-medium">
              {scan.assessment_coverage?.toFixed(0) ?? 0}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${scan.assessment_coverage ?? 0}%` }}
            />
          </div>
        </div>

        {scan.highest_severity && SeverityIcon && (
          <div className="flex items-center gap-1.5 text-xs">
            <SeverityIcon className={`w-3.5 h-3.5 ${severityColor}`} />
            <span className="text-slate-400">Highest:</span>
            <span className={`${severityColor} font-medium capitalize`}>
              {scan.highest_severity}
            </span>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
        The Security Assessment Score measures the selected checks and cannot guarantee complete API safety.
        A high score does not confirm absence of vulnerabilities.
      </p>
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
      {icon}
      <div>
        <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
