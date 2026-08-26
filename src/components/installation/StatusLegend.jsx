import React from 'react';

const LEGEND = [
  { key: 'early',       label: 'Early',       color: '#22c55e' },
  { key: 'on_time',     label: 'On Time',     color: '#22c55e' },
  { key: 'scheduled',   label: 'Scheduled',   color: '#3b82f6' },
  { key: 'pending',     label: 'No Date',     color: '#6b7280' },
  { key: 'late',        label: 'Late',        color: '#ef4444' },
  { key: 'rescheduled', label: 'Rescheduled', color: '#eab308' },
  { key: 'bled_over',   label: 'Bled Over',   color: '#f97316' },
  { key: 'failed',      label: 'Failed',      color: '#ef4444' },
];

export default function StatusLegend() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Status Legend
      </h2>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {LEGEND.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">How statuses work</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-6 text-xs text-gray-500">
          <p><strong className="text-gray-600">Early</strong> — completed before the install date</p>
          <p><strong className="text-gray-600">On Time</strong> — completed on the install date</p>
          <p><strong className="text-gray-600">Scheduled</strong> — has a future install date</p>
          <p><strong className="text-gray-600">No Date</strong> — reviewed but no install date yet</p>
          <p><strong className="text-gray-600">Late</strong> — past install date, not yet completed</p>
          <p><strong className="text-gray-600">Rescheduled</strong> — completed but had reschedules</p>
          <p><strong className="text-gray-600">Bled Over</strong> — completed late (past the install date)</p>
          <p><strong className="text-gray-600">Failed</strong> — job failed or was cancelled</p>
        </div>
      </div>
    </div>
  );
}
