import React from 'react';

const STATUSES = [
  { key: 'early',       label: 'Early',       desc: 'Completed before Install Date, 0 reschedules',         color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  { key: 'on_time',     label: 'On Time',     desc: 'Completed on Install Date, 0 reschedules',             color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { key: 'bled_over',   label: 'Bled Over',   desc: 'Completed after Install Date, 0 reschedules (ran late)', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { key: 'rescheduled', label: 'Rescheduled', desc: 'Completed after 1 reschedule (yellow flag)',            color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  { key: 'failed',      label: 'Failed',      desc: 'Completed after 2+ reschedules (red flag)',             color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { key: 'scheduled',   label: 'Scheduled',   desc: 'Install Date in future, 0 reschedules',                color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { key: 'at_risk',     label: 'At Risk',     desc: 'Install Date in future but already rescheduled 1+',    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { key: 'late',        label: 'Late',        desc: 'Install Date has passed, task still open',              color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { key: 'pending',     label: 'Pending',     desc: 'No Install Date set',                                  color: 'bg-white/10 text-white/50 border-white/10' },
];

export default function StatusLegend({ summary }) {
  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4">Status Guide</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {STATUSES.map((s) => {
          let val = '—';
          if (s.key === 'early') val = summary?.early;
          else if (s.key === 'on_time') val = summary?.onTime;
          else if (s.key === 'bled_over') val = summary?.bledOver;
          else if (s.key === 'rescheduled') val = summary?.rescheduled;
          else if (s.key === 'failed') val = summary?.failed;
          else if (s.key === 'scheduled') val = summary?.scheduled;
          else if (s.key === 'at_risk') val = summary?.atRisk;
          else if (s.key === 'late') val = summary?.late;
          else if (s.key === 'pending') val = summary?.pending;

          return (
            <div key={s.key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5">
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-white font-bold tabular-nums text-sm">{val ?? 0}</span>
              </div>
              <p className="text-white/40 text-xs leading-relaxed">{s.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
