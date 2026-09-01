import React, { useState, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { usePipeline } from '../../hooks/sales/usePipeline';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLORS = ['#4361ee', '#06d6a0', '#ffd166', '#ef476f', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];

const PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'custom', label: 'Custom' },
];

function DealModal({ title, deals, onClose }) {
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
          {deals.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No deals</p>
          ) : deals.map((deal) => (
            <div key={deal.id} className="bg-black/[0.03] rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{deal.name}</span>
                {deal.stage && <span className="text-gray-500 text-xs">{deal.stage}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                {deal.amount > 0 && (
                  <span className="text-accent font-semibold">${deal.amount.toLocaleString()}</span>
                )}
                {deal.daysSince != null && (
                  <span className="bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                    {deal.daysSince}d stale
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineCard({ name, data, onModal }) {
  if (!data || data.stages.length === 0) return null;

  const chartData = data.stages.filter((s) => s.count > 0);

  const chartHeight = Math.max(160, chartData.length * 36);

  const chartJsData = {
    labels: chartData.map((s) => s.label),
    datasets: [
      {
        data: chartData.map((s) => s.value),
        backgroundColor: chartData.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
        borderRadius: 6,
        borderSkipped: 'left',
      },
    ],
  };

  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const stage = chartData[idx];
        onModal(`${name} \u2014 ${stage.label}`, stage.deals.map((d) => ({ ...d, stage: stage.label })));
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
            const stage = chartData[ctx.dataIndex];
            return `${stage.count} deals \u2014 $${ctx.parsed.x.toLocaleString()}`;
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
  };

  return (
    <div className="bg-black/[0.03] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{name}</h3>
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => onModal(`${name} \u2014 All Deals`, data.dealList)}
            className="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            {data.totalDeals} deals
          </button>
          <span className="font-semibold text-accent">${data.totalValue.toLocaleString()}</span>
          {data.staleDeals > 0 && (
            <button
              onClick={() => onModal(`${name} \u2014 Stale Deals`, data.staleList)}
              className="bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium hover:bg-warning/30 transition-colors cursor-pointer"
            >
              {data.staleDeals} stale
            </button>
          )}
        </div>
      </div>
      {chartData.length > 0 ? (
        <div style={{ height: chartHeight }}>
          <Bar data={chartJsData} options={chartOptions} style={{ cursor: 'pointer' }} />
        </div>
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">No deals in this period</p>
      )}
    </div>
  );
}

export default function PipelineHealth() {
  const { data, loading, error, period, setPeriod, customRange, setCustomRange } = usePipeline();
  const [modal, setModal] = useState(null); // { title, deals }

  const totalValue = data ? Object.values(data).reduce((s, p) => s + p.totalValue, 0) : 0;
  const totalStale = data ? Object.values(data).reduce((s, p) => s + p.staleDeals, 0) : 0;
  const allStaleDeals = data ? Object.values(data).flatMap((p) => p.staleList || []).sort((a, b) => b.daysSince - a.daysSince) : [];
  const selectedLabel = PERIODS.find((p) => p.value === period)?.label ?? 'All Time';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pipeline Health</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              {period === 'all' ? 'Total Pipeline:' : `Pipeline Created ${selectedLabel}:`}
            </span>
            {loading ? (
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-2xl font-bold text-accent">${totalValue.toLocaleString()}</span>
            )}
            {totalStale > 0 && !loading && (
              <button
                onClick={() => setModal({ title: 'All Stale Deals (14+ days)', deals: allStaleDeals })}
                className="bg-warning/20 text-warning px-3 py-1 rounded-full text-xs font-medium hover:bg-warning/30 transition-colors cursor-pointer"
              >
                {totalStale} stale deals (14+ days)
              </button>
            )}
          </div>
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
          Failed to load pipeline: {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(data).map(([key, pipelineData]) =>
            pipelineData.totalDeals > 0 ? (
              <PipelineCard
                key={key}
                name={pipelineData.label}
                data={pipelineData}
                onModal={(title, deals) => setModal({ title, deals })}
              />
            ) : (
              <div key={key} className="bg-black/[0.03] rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">{pipelineData.label}</h3>
                <p className="text-gray-500 text-sm text-center py-6">No deals created in this period</p>
              </div>
            )
          )}
        </div>
      ) : null}

      {modal && (
        <DealModal
          title={modal.title}
          deals={modal.deals}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
