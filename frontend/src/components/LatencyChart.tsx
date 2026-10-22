// src/components/LatencyChart.tsx — HTTP Latency Recharts line chart

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { LatencyStats } from '../types';
import { Activity, AlertCircle, Clock } from 'lucide-react';

interface Props {
  latency: LatencyStats;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="glass-card px-3 py-2 text-xs space-y-1">
        <p className="text-slate-300 font-medium">Request #{label}</p>
        {val !== null && val !== undefined ? (
          <p className="text-cyan-400">{val.toFixed(1)} ms</p>
        ) : (
          <p className="text-red-400">Failed / Timeout</p>
        )}
      </div>
    );
  }
  return null;
};

export default function LatencyChart({ latency }: Props) {
  const data = latency.samples.map((s) => ({
    request: s.request_number,
    ms: s.response_time_ms ?? null,
    status: s.status_code,
    failed: s.timed_out || s.error ? 'failed' : null,
  }));

  return (
    <div className="glass-card glow-card-hover border border-slate-700/60 rounded-2xl p-6 fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-base font-semibold text-white">HTTP Latency</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <StatPill label="Avg" value={latency.avg_ms} color="cyan" />
          <StatPill label="Min" value={latency.min_ms} color="green" />
          <StatPill label="Max" value={latency.max_ms} color="orange" />
          {latency.failed_requests > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span>{latency.failed_requests} failed</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,85,105,0.3)" />
            <XAxis
              dataKey="request"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(71,85,105,0.4)' }}
              label={{ value: 'Request #', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(71,85,105,0.4)' }}
              unit=" ms"
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            {latency.avg_ms && (
              <ReferenceLine
                y={latency.avg_ms}
                stroke="#06b6d4"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{ value: `avg ${latency.avg_ms.toFixed(0)}ms`, fill: '#06b6d4', fontSize: 10 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="ms"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { failed: string | null; ms: number } };
                if (payload.failed) {
                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#ef4444" stroke="none" />;
                }
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#06b6d4" stroke="#0f172a" strokeWidth={1} />;
              }}
              connectNulls={false}
              name="Response Time"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-slate-500 mt-3">
        {latency.samples.length} sequential GET requests. Latency measured end-to-end from scanner to target.
      </p>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value?: number | null; color: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
  };
  return (
    <div className="flex items-center gap-1">
      <Clock className={`w-3 h-3 ${colorMap[color]}`} />
      <span className="text-slate-400">{label}:</span>
      <span className={`font-medium ${colorMap[color]}`}>
        {value !== null && value !== undefined ? `${value.toFixed(0)}ms` : 'N/A'}
      </span>
    </div>
  );
}
