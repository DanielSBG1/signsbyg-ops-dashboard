// src/components/excellence/TeamScorecard.jsx
import React from 'react';
import { gradeColor, scoreColor } from '../../lib/excellenceUtils.js';

const GRADE_BG = { A: 'border-success/40 bg-success/5', B: 'border-accent/40 bg-accent/5', C: 'border-warning/40 bg-warning/5', D: 'border-orange-400/40 bg-orange-400/5', F: 'border-danger/40 bg-danger/5' };

export default function TeamScorecard({ team, isActive, onClick }) {
  if (!team) return null;

  const borderBg = GRADE_BG[team.grade] ?? 'border-gray-200 bg-white';

  // Top 3 KPI pills — sorted: worst first (most need attention)
  const pills = [...(team.operational?.kpis ?? [])]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[160px] text-left p-4 rounded-2xl border transition-all ${borderBg} ${isActive ? 'ring-2 ring-gray-300' : 'hover:bg-gray-50'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl leading-none">{team.emoji}</span>
        <span className="text-sm font-semibold text-gray-700">{team.label}</span>
        {team.dataUnavailable && (
          <span className="ml-auto text-[10px] text-gray-400 border border-gray-200 rounded px-1">loading</span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-end gap-2 mb-1">
        <span className="text-4xl font-bold text-gray-900 tabular-nums leading-none">{team.score}</span>
        <span className={`text-2xl font-bold leading-none pb-0.5 ${gradeColor(team.grade)}`}>{team.grade}</span>
      </div>

      {/* Sub-scores */}
      <div className="flex gap-3 mb-3 text-[10px] text-gray-400">
        <span>Ops {team.operational?.score ?? '—'}</span>
        <span>Culture {team.culture?.score ?? '—'}</span>
      </div>

      {/* KPI pills */}
      <div className="space-y-1">
        {pills.map(p => (
          <div key={p.key ?? p.label} className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 truncate">{p.label}</span>
            <span className={`text-[10px] font-semibold tabular-nums ml-2 ${scoreColor(p.score)}`}>
              {p.score}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
