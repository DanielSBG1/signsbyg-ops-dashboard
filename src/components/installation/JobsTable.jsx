import React, { useState } from 'react';

const STATUS_STYLES = {
  early:       'bg-green-500/20 text-green-300 border-green-500/30',
  on_time:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  scheduled:   'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  pending:     'bg-white/10 text-white/50 border-white/10',
  late:        'bg-orange-500/20 text-orange-300 border-orange-500/30',
  rescheduled: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  failed:      'bg-red-500/20 text-red-300 border-red-500/30',
};

const STATUS_LABELS = {
  early: 'Early',
  on_time: 'On Time',
  scheduled: 'Scheduled',
  pending: 'Pending',
  late: 'Late',
  rescheduled: 'Rescheduled',
  failed: 'Failed',
};

export default function JobsTable({ jobs }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter, setCrewFilter] = useState('all');
  const [search, setSearch] = useState('');

  if (!jobs) return null;

  const statuses = [...new Set(jobs.map((j) => j.status))];
  const crews = [...new Set(jobs.flatMap((j) => j.crews))].filter(Boolean);

  let filtered = jobs;
  if (statusFilter !== 'all') filtered = filtered.filter((j) => j.status === statusFilter);
  if (crewFilter !== 'all') filtered = filtered.filter((j) => j.crews.includes(crewFilter));
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((j) =>
      (j.name || '').toLowerCase().includes(s) ||
      (j.address || '').toLowerCase().includes(s) ||
      (j.contactName || '').toLowerCase().includes(s)
    );
  }

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <span className="text-white/40 text-sm">{filtered.length} showing</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
          </select>
          <select
            value={crewFilter}
            onChange={(e) => setCrewFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All crews</option>
            {crews.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs uppercase tracking-wider">
              <th className="text-left pb-3 px-3">Job</th>
              <th className="text-left pb-3 px-3">Status</th>
              <th className="text-left pb-3 px-3">Section</th>
              <th className="text-left pb-3 px-3">Install Date</th>
              <th className="text-left pb-3 px-3">Crew</th>
              <th className="text-left pb-3 px-3">Metro</th>
              <th className="text-left pb-3 px-3">PM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((j) => (
              <tr key={j.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="py-3 px-3">
                  <a href={j.url} target="_blank" rel="noreferrer" className="text-white font-medium hover:text-accent">
                    {j.name}
                  </a>
                  {j.address && <div className="text-white/40 text-xs">{j.address}</div>}
                </td>
                <td className="py-3 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[j.status] || ''}`}>
                    {STATUS_LABELS[j.status] || j.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-white/60 text-xs">{j.section || '—'}</td>
                <td className="py-3 px-3 text-white/80 tabular-nums text-xs">{j.installDate || '—'}</td>
                <td className="py-3 px-3 text-white/80 text-xs">{j.crews.join(', ') || '—'}</td>
                <td className="py-3 px-3 text-white/60 text-xs">{j.metro || '—'}</td>
                <td className="py-3 px-3 text-white/60 text-xs">{j.pm || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="text-center py-3 text-white/40 text-xs">Showing first 200 of {filtered.length}</div>
        )}
      </div>
    </div>
  );
}
