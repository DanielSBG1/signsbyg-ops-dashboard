import React from 'react';

const STATUSES = [
  { key: 'early',       label: 'Early',       desc: 'Completed before Install Date, 0 reschedules',         color: 'bg-green-500/10 text-green-700 border-green-500/20' },
  { key: 'on_time',     label: 'On Time',     desc: 'Completed on Install Date, 0 reschedules',             color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  { key: 'bled_over',   label: 'Bled Over',   desc: 'Completed after Install Date, 0 reschedules (ran late)', color: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  { key: 'rescheduled', label: 'Rescheduled', desc: 'Completed after 1 reschedule (yellow flag)',            color: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  { key: 'failed',      label: 'Failed',      desc: 'Completed after 2+ reschedules (red flag)',             color: 'bg-red-500/10 text-red-700 border-red-500/20' },
  { key: 'scheduled',   label: 'Scheduled',   desc: 'Install Date in future, 0 reschedules',                color: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20' },
  { key: 'at_risk',     label: 'At Risk',     desc: 'Install Date in future but already rescheduled 1+',    color: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  { key: 'late',        label: 'Late',        desc: 'Install Date has passed, task still open',              color: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  { key: 'pending',     label: 'Pending',     desc: 'No Install Date set',                                  color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
];

export default function StatusLegend({ summary }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Guide</h2>
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
            <div key={s.key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-gray-900 font-bold tabular-nums text-sm">{val ?? 0}</span>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
