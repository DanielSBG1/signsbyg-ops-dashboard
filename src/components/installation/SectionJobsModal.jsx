import React from 'react';
import { SECTION_DATE_FIELD, getSectionJobState, STATE_COLORS, STATE_LABELS } from '../../lib/sectionDates';

const STATUS_STYLES = {
  early:       'bg-green-500/20 text-green-300 border-green-500/30',
  on_time:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  scheduled:   'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  at_risk:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
  pending:     'bg-black/[0.05] text-gray-500 border-gray-200',
  late:        'bg-orange-500/20 text-orange-300 border-orange-500/30',
  rescheduled: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  bled_over:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  failed:      'bg-red-500/20 text-red-300 border-red-500/30',
};

const STATUS_LABELS = {
  early: 'Early', on_time: 'On Time', scheduled: 'Scheduled', at_risk: 'At Risk',
  pending: 'Pending', late: 'Late', rescheduled: 'Rescheduled', bled_over: 'Bled Over', failed: 'Failed',
};

const DATE_FIELD_LABEL = {
  installDate: 'Installation Date',
  surveyDate:  'Survey Date',
  serviceDate: 'Service Date',
};

function formatAge(createdAt) {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
  if (ageHours < 1) return `${Math.round(ageHours * 60)}m`;
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${(ageHours / 24).toFixed(1)}d`;
}

function ageColor(createdAt) {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (60 * 60 * 1000);
  if (ageHours > 24) return 'text-danger font-bold';
  if (ageHours > 12) return 'text-warning';
  return 'text-gray-500';
}

export default function SectionJobsModal({ section, jobs, onClose }) {
  if (!section || !jobs) return null;

  // Base section name before we added " - Fresh/Stale" suffixes for intake filters
  const baseName = section.name.split(' —')[0].trim();
  const isUnreviewed = baseName === 'Unreviewed';
  const sortedJobs = isUnreviewed
    ? [...jobs].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    : jobs;

  // The specific date field this section cares about (install/survey/service)
  const dateField = SECTION_DATE_FIELD[baseName];
  const dateFieldLabel = dateField ? DATE_FIELD_LABEL[dateField] : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 rounded-2xl p-6 max-w-6xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{section.name}</h2>
            <p className="text-gray-500 text-sm">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left pb-3 px-3">Job</th>
                <th className="text-left pb-3 px-3">State</th>
                {isUnreviewed && <th className="text-left pb-3 px-3">Age</th>}
                {dateFieldLabel && <th className="text-left pb-3 px-3">{dateFieldLabel}</th>}
                <th className="text-left pb-3 px-3">Promised</th>
                <th className="text-center pb-3 px-3">Resch.</th>
                <th className="text-left pb-3 px-3">Crew</th>
                <th className="text-left pb-3 px-3">PM</th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.map((j) => {
                const state = getSectionJobState(j);
                const relevantDate = dateField ? j[dateField] : null;
                return (
                  <tr key={j.id} className="border-t border-gray-100 hover:bg-black/[0.02]">
                    <td className="py-3 px-3">
                      <a href={j.url} target="_blank" rel="noreferrer" className="text-gray-900 font-medium hover:text-accent">
                        {j.name}
                      </a>
                      {j.address && <div className="text-gray-500 text-xs">{j.address}</div>}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${STATE_COLORS[state]}33`, border: `1px solid ${STATE_COLORS[state]}66`, color: STATE_COLORS[state] }}
                      >
                        {STATE_LABELS[state]}
                      </span>
                    </td>
                    {isUnreviewed && (
                      <td className={`py-3 px-3 tabular-nums text-xs ${ageColor(j.createdAt)}`}>
                        {j.createdAt ? formatAge(j.createdAt) : '—'}
                      </td>
                    )}
                    {dateFieldLabel && (
                      <td className="py-3 px-3 text-gray-700 tabular-nums text-xs">
                        {relevantDate || <span className="text-danger">missing</span>}
                      </td>
                    )}
                    <td className="py-3 px-3 text-gray-500 tabular-nums text-xs">{j.promisedDate || '—'}</td>
                    <td className="py-3 px-3 text-center tabular-nums text-xs">
                      {j.reschedules > 0 ? (
                        <span className={`font-bold ${j.reschedules >= 2 ? 'text-danger' : 'text-warning'}`}>{j.reschedules}</span>
                      ) : (
                        <span className="text-gray-500">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-xs">{(j.crews || []).join(', ') || '—'}</td>
                    <td className="py-3 px-3 text-gray-500 text-xs">{j.pm || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
