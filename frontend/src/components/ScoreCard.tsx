// src/components/ScoreCard.tsx — Security Assessment Score display
import type { Scan } from '../types';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Clock, AlertOctagon, ShieldCheck } from 'lucide-react';

interface Props {
  scan: Scan;
}

function getScoreColor(score?: number): string {
  if (score === undefined || score === null) return '#64748b';
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#06b6d4';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

function getScoreLabel(score?: number): string {
  if (score === undefined || score === null) return 'No Assessment Data';
  if (score >= 90) return 'Hardened Perimeter (A+)';
  if (score >= 75) return 'Satisfactory Posture (B)';
  if (score >= 50) return 'Weaknesses Present (C)';
  return 'Critical Exposures (F)';
}

const SEVERITY_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>, color: string }> = {
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
      ? `${(scan.duration_ms / 1000).toFixed(2)}s`
      : `${Math.round(scan.duration_ms)}ms`
    : null;

  return (
    <div className="glass-card p-6 sm:p-7 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden fade-in flex flex-col justify-between">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Evidence-Based Evaluation
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Security Assessment Score</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Earned <strong className="text-white font-mono">{scan.earned_points?.toFixed(0) ?? 0}</strong> of{' '}
            <strong className="text-white font-mono">{scan.assessed_points?.toFixed(0) ?? 0}</strong> points
          </p>
        </div>
        {duration && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {duration}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 my-2">
        {/* Animated Score Ring */}
        <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke="#1e293b"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-black font-mono tracking-tight" style={{ color: scoreColor }}>
              {score !== undefined && score !== null ? Math.round(score) : '—'}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest -mt-0.5">
              / 100
            </span>
          </div>
        </div>

        {/* 4 Stat Tiles */}
        <div className="grid grid-cols-2 gap-2.5 flex-1 w-full">
          <StatTile
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            label="Passed Checks"
            value={scan.passed_checks}
            valueClass="text-emerald-400"
          />
          <StatTile
            icon={<XCircle className="w-4 h-4 text-red-400" />}
            label="Failed Checks"
            value={scan.failed_checks}
            valueClass="text-red-400"
          />
          <StatTile
            icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
            label="Warnings"
            value={scan.warning_checks}
            valueClass="text-amber-400"
          />
          <StatTile
            icon={<HelpCircle className="w-4 h-4 text-slate-500" />}
            label="Inconclusive"
            value={scan.inconclusive_checks}
            valueClass="text-slate-400"
          />
        </div>
      </div>

      {/* Coverage Bar & Highest Severity */}
      <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1.5 font-medium">
            <span className="text-slate-400">Assessment Coverage Ratio</span>
            <span className="text-white font-mono font-bold">
              {scan.assessment_coverage?.toFixed(0) ?? 0}%
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${scan.assessment_coverage ?? 0}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-slate-400 font-medium">Posture Status:</span>
          <span className="font-bold text-white" style={{ color: scoreColor }}>
            {scoreLabel}
          </span>
        </div>

        {scan.highest_severity && SeverityIcon && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Worst Finding Severity:</span>
            <span className={`flex items-center gap-1 font-bold capitalize ${severityColor}`}>
              <SeverityIcon className="w-3.5 h-3.5" />
              {scan.highest_severity}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
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
    <div className="flex items-center gap-2.5 bg-slate-900/80 border border-slate-800/80 rounded-xl px-3 py-2.5">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className={`text-base font-extrabold font-mono leading-tight ${valueClass}`}>{value}</div>
        <div className="text-[10px] text-slate-500 font-medium truncate">{label}</div>
      </div>
    </div>
  );
}
