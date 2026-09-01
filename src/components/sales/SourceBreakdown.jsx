import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { useSources } from '../../hooks/sales/useSources';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

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
        className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 flex flex-col gap-2">
          {leads.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No leads</p>
          ) : leads.map((lead) => (
            <div key={lead.id} className="bg-black/[0.03] rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{lead.name}</span>
                {lead.email && <span className="text-gray-500 text-xs truncate">{lead.email}</span>}
              </div>
              {lead.createdAt && (
                <span className="text-gray-500 text-xs shrink-0">{lead.createdAt}</span>
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
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lead Sources</h2>
          {loading && (
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Period picker \u2014 intentionally smaller than TopBar (text-xs/py-1) to fit inside the card */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-accent text-white'
                  : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05] hover:text-gray-900'
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
              className="bg-black/[0.03] border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
              className="bg-black/[0.03] border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900"
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
              <div style={{ height: Math.max(160, barData.length * 36) }}>
                <Bar
                  style={{ cursor: 'pointer' }}
                  data={{
                    labels: barData.map((d) => d.name),
                    datasets: [
                      {
                        data: barData.map((d) => d.value),
                        backgroundColor: barData.map((d) => d.color + 'd9'),
                        borderRadius: 6,
                        borderSkipped: 'left',
                      },
                    ],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (event, elements) => {
                      if (elements.length > 0) {
                        const idx = elements[0].index;
                        const entry = barData[idx];
                        const leads = (data.leads?.[entry.id] || []);
                        setModal({ title: `${entry.name} Leads`, leads });
                      }
                    },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#ffffff',
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        titleColor: '#6b7280',
                        bodyColor: '#111827',
                        callbacks: {
                          label: (ctx) => {
                            const val = ctx.parsed.x;
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return `${val} leads (${pct}%)`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: { display: false },
                      y: {
                        ticks: { color: 'rgba(107,114,128,0.8)', font: { size: 11 } },
                        grid: { display: false },
                        border: { display: false },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-12">No leads in this period</p>
            )}
          </div>

          {/* Daily Trend Line */}
          <div>
            <h3 className="text-sm text-gray-500 font-medium mb-3">Leads Per Day</h3>
            {data.daily && data.daily.length > 0 ? (
              <div style={{ height: Math.max(160, barData.length * 36) }}>
                <Line
                  data={{
                    labels: data.daily.map((d) => {
                      const parts = d.date.split('-');
                      return `${parts[1]}/${parts[2]}`;
                    }),
                    datasets: [
                      {
                        data: data.daily.map((d) => d.count),
                        borderColor: '#4361ee',
                        backgroundColor: '#4361ee',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#ffffff',
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        titleColor: '#6b7280',
                        bodyColor: '#111827',
                        callbacks: {
                          label: (ctx) => `${ctx.parsed.y} leads`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { color: 'rgba(107,114,128,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        border: { display: false },
                      },
                      y: {
                        ticks: { color: 'rgba(107,114,128,0.6)', font: { size: 11 }, precision: 0 },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        border: { display: false },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-12">No daily data available</p>
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
