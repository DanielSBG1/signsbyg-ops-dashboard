import React from 'react';

export default function CrewScorecard({ byCrew, unassignedCount, onUnassignedClick }) {
  if (!byCrew || byCrew.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Crew Scorecard</h2>
        {unassignedCount > 0 && (
          <button
            onClick={onUnassignedClick}
            className="px-3 py-1 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-colors"
          >
            {unassignedCount} unassigned &rarr;
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase tracking-wider">
            <th className="text-left pb-3 px-3">Crew</th>
            <th className="text-right pb-3 px-3">Open</th>
            <th className="text-right pb-3 px-3">Done</th>
            <th className="text-right pb-3 px-3">On-Time</th>
            <th className="text-right pb-3 px-3">Resch.</th>
            <th className="text-right pb-3 px-3">Failed</th>
            <th className="text-right pb-3 px-3">On-Time %</th>
          </tr>
        </thead>
        <tbody>
          {byCrew.map((c) => (
            <tr key={c.name} className="border-t border-gray-200 hover:bg-black/[0.03]">
              <td className="py-3 px-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                <span className="font-medium">{c.name}</span>
              </td>
              <td className="py-3 px-3 text-right tabular-nums">{c.open}</td>
              <td className="py-3 px-3 text-right tabular-nums text-gray-500">{c.completed}</td>
              <td className="py-3 px-3 text-right tabular-nums text-success">{c.onTime || 0}</td>
              <td className="py-3 px-3 text-right tabular-nums">
                <span className={c.rescheduled > 0 ? 'text-warning' : 'text-gray-500'}>{c.rescheduled || 0}</span>
              </td>
              <td className="py-3 px-3 text-right tabular-nums">
                <span className={c.failed > 0 ? 'text-danger' : 'text-gray-500'}>{c.failed || 0}</span>
              </td>
              <td className="py-3 px-3 text-right tabular-nums">
                <span className={`font-semibold ${
                  c.onTimeRate >= 80 ? 'text-success' :
                  c.onTimeRate >= 60 ? 'text-warning' :
                  c.completed > 0 ? 'text-danger' : 'text-gray-500'
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
