import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { useSources } from '../../hooks/sales/useSources';

const SOURCE_COLORS = {
  facebook: '#4361ee',
  paid_social_other: '#8b5cf6',
  offline: '#06d6a0',
  organic: '#ffd166',
  direct: '#f97316',
  referrals: '#06b6d4',
  other: '#6b7280',
};

const SOURCE_LABELS = {
  facebook: 'Facebook',
  paid_social_other: 'Other Paid Social',
  offline: 'Offline / Manual',
  organic: 'Organic Search',
  direct: 'Direct Traffic',
  referrals: 'Referrals',
  other: 'Other',
};

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'custom', label: 'Custom' },
];

function LeadModal({ title, leads, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-card border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 flex flex-col gap-2">
          {leads.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">No leads</p>
          ) : leads.map((lead) => (
            <div key={lead.id} className="bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{lead.name}</span>
                {lead.email && <span className="text-white/40 text-xs truncate">{lead.email}</span>}
              </div>
              {lead.createdAt && (
                <span className="text-white/30 text-xs shrink-0">{lead.createdAt}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SourceBreakdown() {
  const { data, loading, error, period, setPeriod, customRange, setCustomRange } = useSources();
  const [modal, setModal] = useState(null); // { title, leads }

  const barData = data
    ? Object.entries(data.breakdown)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({
          id: key,
          name: SOURCE_LABELS[key] || key,
          value,
          color: SOURCE_COLORS[key] || '#6b7280',
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const total = barData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lead Sources</h2>
          {loading && (
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Period picker — intentionally smaller than TopBar (text-xs/py-1) to fit inside the card */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
            <span className="text-white/40">to</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm mb-4">
          Failed to load sources: {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 36)}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ left: 0, right: 40, top: 0, bottom: 0 }}
                  onClick={(e) => {
                    if (e?.activePayload?.[0]) {
                      const entry = e.activePayload[0].payload;
                      const leads = (data.leads?.[entry.id] || []);
                      setModal({ title: `${entry.name} Leads`, leads });
                    }
                  }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e1e30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    labelStyle={{ color: 'white' }}
                    formatter={(val) => [`${val} leads (${total > 0 ? Math.round((val / total) * 100) : 0}%)`, '']}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} style={{ cursor: 'pointer' }} label={{ position: 'right', fill: 'rgba(255,255,255,0.4)', fontSize: 11, formatter: (v) => v }}>
                    {barData.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/20 text-sm text-center py-12">No leads in this period</p>
            )}
          </div>

          {/* Daily Trend Line */}
          <div>
            <h3 className="text-sm text-white/40 font-medium mb-3">Leads Per Day</h3>
            {data.daily && data.daily.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 36)}>
                <LineChart data={data.daily} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                    tickFormatter={(d) => { const parts = d.split('-'); return `${parts[1]}/${parts[2]}`; }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e1e30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    labelStyle={{ color: 'white' }}
                    formatter={(val) => [`${val} leads`, '']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#4361ee"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#4361ee' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-white/20 text-sm text-center py-12">No daily data available</p>
            )}
          </div>
        </div>
      ) : null}

      {modal && (
        <LeadModal
          title={modal.title}
          leads={modal.leads}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
