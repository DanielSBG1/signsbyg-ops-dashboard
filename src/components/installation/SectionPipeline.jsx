import React from 'react';

export default function SectionPipeline({ bySection }) {
  if (!bySection) return null;
  const max = Math.max(...bySection.map((s) => s.count), 1);

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4">Pipeline by Section (Open Jobs)</h2>
      <div className="space-y-2">
        {bySection.map((s) => (
          <div key={s.gid} className="flex items-center gap-3">
            <div className="w-64 text-sm text-white/70 shrink-0">{s.name}</div>
            <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded flex items-center justify-end pr-2 transition-all"
                style={{ width: `${(s.count / max) * 100}%`, minWidth: s.count > 0 ? '2rem' : '0' }}
              >
                {s.count > 0 && <span className="text-xs text-white font-semibold">{s.count}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
