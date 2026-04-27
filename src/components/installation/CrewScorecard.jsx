import React from 'react';

export default function CrewScorecard({ byCrew }) {
  if (!byCrew || byCrew.length === 0) return null;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Crew Scorecard</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/40 text-xs uppercase tracking-wider">
            <th className="text-left pb-3 px-3">Crew</th>
            <th className="text-right pb-3 px-3">Open</th>
            <th className="text-right pb-3 px-3">Completed</th>
            <th className="text-right pb-3 px-3">On-Time</th>
            <th className="text-right pb-3 px-3">On-Time %</th>
          </tr>
        </thead>
        <tbody>
          {byCrew.map((c) => (
            <tr key={c.name} className="border-t border-white/5 hover:bg-white/5">
              <td className="py-3 px-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                <span className="font-medium">{c.name}</span>
              </td>
              <td className="py-3 px-3 text-right tabular-nums">{c.open}</td>
              <td className="py-3 px-3 text-right tabular-nums text-white/60">{c.completed}</td>
              <td className="py-3 px-3 text-right tabular-nums text-white/60">{c.onTime}</td>
              <td className="py-3 px-3 text-right tabular-nums">
                <span className={`font-semibold ${
                  c.onTimeRate >= 80 ? 'text-success' :
                  c.onTimeRate >= 60 ? 'text-warning' :
                  c.completed > 0 ? 'text-danger' : 'text-white/30'
                }`}>
                  {c.completed > 0 ? `${c.onTimeRate}%` : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
