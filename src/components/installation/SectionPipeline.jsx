import React from 'react';
import { STATE_COLORS, STATE_LABELS } from '../../lib/sectionDates';

// Order the segments so the bar reads left-to-right worst-to-best:
// red (late) → blue (today) → green (on track) → gray (missing) → dim (n/a)
const STATE_ORDER = ['late', 'today', 'on_track', 'missing', 'na'];

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
      {['late', 'today', 'on_track', 'missing', 'completed'].map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATE_COLORS[s] }} />
          {STATE_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

export default function SectionPipeline({ bySection, onSectionClick }) {
  if (!bySection) return null;
  const max = Math.max(...bySection.map((s) => s.count), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Pipeline by Section</h2>
      </div>
      <Legend />

      <div className="space-y-2">
        {bySection.map((s) => {
          const totalOpen = s.count;
          const widthPct = (totalOpen / max) * 100;

          return (
            <button
              key={s.gid}
              onClick={() => totalOpen > 0 && onSectionClick && onSectionClick(s)}
              disabled={totalOpen === 0}
              className={`w-full flex items-center gap-3 text-left rounded-lg transition-colors ${
                totalOpen > 0 ? 'hover:bg-black/[0.03] cursor-pointer' : 'opacity-50 cursor-default'
              }`}
            >
              <div className="w-56 text-sm text-gray-600 shrink-0 py-1">
                <div>{s.name}</div>
                {s.completed > 0 && (
                  <div className="text-gray-500 text-[10px]">
                    {s.completed} completed
                  </div>
                )}
              </div>

              <div className="flex-1 flex items-center gap-2">
                {/* Stacked bar — each state as a colored segment */}
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden flex">
                  {totalOpen > 0 && (
                    <div
                      className="h-full flex rounded overflow-hidden"
                      style={{ width: `${widthPct}%`, minWidth: '2rem' }}
                    >
                      {STATE_ORDER.map((state) => {
                        const n = s.states?.[state] || 0;
                        if (n === 0) return null;
                        const segPct = (n / totalOpen) * 100;
                        return (
                          <div
                            key={state}
                            className="h-full flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ width: `${segPct}%`, backgroundColor: STATE_COLORS[state] }}
                            title={`${STATE_LABELS[state]}: ${n}`}
                          >
                            {segPct > 10 ? n : ''}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="w-10 text-right text-sm font-semibold tabular-nums">
                  {totalOpen}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
