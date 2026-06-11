// src/components/excellence/CompanyTrend.jsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TEAM_COLORS = {
  pm:           '#a855f7',
  sales:        '#6366f1',
  production:   '#f97316',
  installation: '#eab308',
  admin:        '#f59e0b',
};

const TEAM_LABELS = {
  pm: 'PM', sales: 'Sales', production: 'Production', installation: 'Installation', admin: 'Admin',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy border border-white/10 rounded-xl p-3 shadow-xl min-w-[150px]">
      <p className="text-xs text-white/40 mb-2">{label}</p>
      {[...payload].sort((a, b) => b.value - a.value).map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-xs text-white/60">{TEAM_LABELS[p.dataKey]}</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CompanyTrend({ history = [] }) {
  if (history.length < 2) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">Company Trend</h3>
        <p className="text-white/30 text-sm text-center py-8">Trend data builds over time — check back next month.</p>
      </div>
    );
  }

  const chartData = history.map(h => ({
    ...h,
    period: h.period.slice(0, 7), // YYYY-MM
  }));

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-6">Company Trend</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="period" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {Object.keys(TEAM_COLORS).map(key => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={TEAM_COLORS[key]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {Object.entries(TEAM_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            <span className="text-[11px] text-white/40">{TEAM_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
