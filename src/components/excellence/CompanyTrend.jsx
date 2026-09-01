// src/components/excellence/CompanyTrend.jsx
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

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


export default function CompanyTrend({ history = [] }) {
  if (history.length < 2) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Company Trend</h3>
        <p className="text-gray-500 text-sm text-center py-8">Trend data builds over time \u2014 check back next month.</p>
      </div>
    );
  }

  const chartData = history.map(h => ({
    ...h,
    period: h.period.slice(0, 7), // YYYY-MM
  }));

  const teamKeys = Object.keys(TEAM_COLORS);

  const chartJsData = {
    labels: chartData.map((h) => h.period),
    datasets: teamKeys.map((key) => ({
      label: key,
      data: chartData.map((h) => h[key] ?? null),
      borderColor: TEAM_COLORS[key],
      backgroundColor: TEAM_COLORS[key],
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0,
      spanGaps: false,
    })),
  };

  const chartOptions = {
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
          title: (items) => items[0]?.label ?? '',
          label: (ctx) => `${TEAM_LABELS[ctx.dataset.label]}: ${ctx.parsed.y}`,
        },
        itemSort: (a, b) => b.parsed.y - a.parsed.y,
      },
    },
    scales: {
      x: {
        ticks: { color: 'rgba(0,0,0,0.4)', font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.06)', dash: [3, 3] },
        border: { display: false },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { color: 'rgba(0,0,0,0.4)', font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.06)', dash: [3, 3] },
        border: { display: false },
      },
    },
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">Company Trend</h3>
      <div style={{ height: 220 }}>
        <Line data={chartJsData} options={chartOptions} />
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {Object.entries(TEAM_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            <span className="text-[11px] text-gray-500">{TEAM_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
