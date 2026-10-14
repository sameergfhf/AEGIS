// src/components/FindingsChart.tsx — Findings by severity bar chart

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FindingsBySeverity, Finding, Severity } from '../types';
import { ShieldAlert } from 'lucide-react';

interface Props {
  findingsBySeverity: FindingsBySeverity;
  findings: Finding[];
}

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', label: 'Critical' },
  high: { color: '#f97316', label: 'High' },
  medium: { color: '#eab308', label: 'Medium' },
  low: { color: '#3b82f6', label: 'Low' },
  informational: { color: '#6b7280', label: 'Info' },
};

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card px-3 py-2 text-xs">
        <p className="text-slate-300 font-medium">{label}</p>
        <p style={{ color: SEVERITY_CONFIG[label?.toLowerCase() as Severity]?.color || '#6b7280' }}>
          {payload[0].value} finding{payload[0].value !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }
  return null;
};

export default function FindingsChart({ findingsBySeverity, findings }: Props) {
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);

  const chartData = Object.entries(SEVERITY_CONFIG).map(([key, { label }]) => ({
    severity: label,
    key: key as Severity,
    count: findingsBySeverity[key as Severity],
  }));

  const filteredFindings = selectedSeverity
    ? findings.filter((f) => f.severity === selectedSeverity)
    : findings;

  const total = Object.values(findingsBySeverity).reduce((a, b) => a + b, 0);

  return (
    <div className="glass-card p-6 fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <h3 className="text-base font-semibold text-white">Security Findings</h3>
        </div>
        <span className="text-xs text-slate-400">{total} total</span>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <ShieldAlert className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No actionable findings detected</p>
        </div>
      ) : (
        <>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.3)" vertical={false} />
                <XAxis
                  dataKey="severity"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(71,85,105,0.4)' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(71,85,105,0.4)' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  onClick={(data) => {
                    const key = data.key as Severity;
                    setSelectedSeverity(selectedSeverity === key ? null : key);
                  }}
                  cursor="pointer"
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={SEVERITY_CONFIG[entry.key].color}
                      opacity={selectedSeverity && selectedSeverity !== entry.key ? 0.3 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Filtered findings list */}
          {filteredFindings.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>
                  {selectedSeverity
                    ? `Showing ${selectedSeverity} findings`
                    : 'All findings'}
                </span>
                {selectedSeverity && (
                  <button
                    onClick={() => setSelectedSeverity(null)}
                    className="text-cyan-400 hover:text-cyan-300"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className="bg-slate-800/40 rounded-lg px-3 py-2 text-xs space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-200 font-medium">{finding.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-xs flex-shrink-0 severity-${finding.severity}`}
                    >
                      {finding.severity}
                    </span>
                  </div>
                  <p className="text-slate-400">{finding.category}</p>
                  {finding.description && (
                    <p className="text-slate-500">{finding.description.slice(0, 120)}</p>
                  )}
                  {finding.remediation && (
                    <p className="text-cyan-400/80 mt-1">Fix: {finding.remediation.slice(0, 150)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
