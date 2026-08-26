// src/components/excellence/TeamDrillDown.jsx
import React from 'react';
import { scoreColor } from '../../lib/excellenceUtils.js';

function KpiRow({ kpi }) {
  const barWidth = `${kpi.score}%`;
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-700">{kpi.label}</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500">{kpi.rawLabel}</span>
          <span className={`text-sm font-bold tabular-nums w-8 text-right ${scoreColor(kpi.score)}`}>{kpi.score}</span>
          <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round((kpi.weight ?? 0) * 100)}%</span>
        </div>
      </div>
      <div className="h-1 bg-black/[0.03] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${kpi.score >= 75 ? 'bg-success' : kpi.score >= 50 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: barWidth }}
        />
      </div>
    </div>
  );
}

function Section({ title, score, kpis }) {
  if (!kpis?.length) return null;
  const sorted = [...kpis].sort((a, b) => a.score - b.score); // worst first
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</h4>
        <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
      </div>
      {sorted.map(k => <KpiRow key={k.key} kpi={k} />)}
    </div>
  );
}

export default function TeamDrillDown({ team }) {
  if (!team) return null;

  const flags = (team.operational?.kpis ?? [])
    .filter(k => k.score < 60)
    .sort((a, b) => a.score - b.score);

  return (
    <div className="mt-4 space-y-4 animate-fade-in">
      {/* Red flags */}
      {flags.length > 0 && (
        <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-danger/80 uppercase tracking-widest mb-2">Needs Attention</p>
          {flags.map(f => (
            <div key={f.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700">{f.label}</span>
              <span className="text-sm font-bold text-danger tabular-nums">{f.score} — {f.rawLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Operational + Culture breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Operational KPIs" score={team.operational?.score} kpis={team.operational?.kpis} />
        <Section title="Culture"          score={team.culture?.score}     kpis={team.culture?.kpis} />
      </div>

      {team.dataUnavailable && (
        <p className="text-xs text-gray-500 text-center py-2">
          Installation data loads from cache — visit the Installation tab first to warm it up, then refresh.
        </p>
      )}
    </div>
  );
}
