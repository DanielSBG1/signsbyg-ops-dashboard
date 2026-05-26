import React, { useState } from 'react';

const STATUS_STYLES = {
  early:       'bg-success/20 text-success',
  on_time:     'bg-success/20 text-success',
  scheduled:   'bg-accent/20 text-accent',
  pending:     'bg-white/10 text-white/40',
  late:        'bg-danger/20 text-danger',
  rescheduled: 'bg-warning/20 text-warning',
  failed:      'bg-danger/20 text-danger',
};

const STATUS_LABELS = {
  early:       'Early',
  on_time:     'On Time',
  scheduled:   'Scheduled',
  pending:     'No Date',
  late:        'Late',
  rescheduled: 'Rescheduled',
  failed:      'Failed',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export default function JobsTable({ jobs }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter,   setCrewFilter]   = useState('all');
  const [search,       setSearch]       = useState('');

  if (!jobs) return null;

  const statuses = [...new Set(jobs.map(j => j.status))];
  const crews    = [...new Set(jobs.flatMap(j => j.crews))].filter(Boolean);

  let filtered = jobs;
  if (statusFilter !== 'all') filtered = filtered.filter(j => j.status === statusFilter);
  if (crewFilter   !== 'all') filtered = filtered.filter(j => j.crews.includes(crewFilter));
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(j =>
      (j.name        || '').toLowerCase().includes(s) ||
      (j.address     || '').toLowerCase().includes(s) ||
      (j.contactName || '').toLowerCase().includes(s)
    );
  }

  return (
    <div className="bg-slate-card border border-white/10 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">All Jobs</p>
          <span className="text-xs text-white/30">{filtered.length} showing</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-accent/50"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
          </select>
          <select
            value={crewFilter}
            onChange={e => setCrewFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All crews</option>
            {crews.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-6 py-2 border-b border-white/[0.04] grid grid-cols-[1fr_100px_140px_130px_130px_100px_100px] gap-4">
        {['Job', 'Status', 'Section', 'Install Date', 'Crew', 'Metro', 'PM'].map(h => (
          <span key={h} className="text-[10px] text-white/25 font-semibold uppercase tracking-widest">{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.04]">
        {filtered.slice(0, 200).map(j => (
          <div key={j.id} className="px-6 py-3 grid grid-cols-[1fr_100px_140px_130px_130px_100px_100px] gap-4 items-center hover:bg-white/[0.03] transition-colors">
            <div className="min-w-0">
              <a href={j.url} target="_blank" rel="noreferrer"
                className="text-sm font-medium text-white hover:text-accent transition-colors truncate block">
                {j.name}
              </a>
              {j.address && <p className="text-[11px] text-white/35 truncate mt-0.5">{j.address}</p>}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit ${STATUS_STYLES[j.status] ?? 'bg-white/10 text-white/40'}`}>
              {STATUS_LABELS[j.status] || j.status}
            </span>
            <span className="text-xs text-white/50 truncate">{j.section || '—'}</span>
            <span className="text-xs text-white/70 tabular-nums">{formatDate(j.installDate)}</span>
            <span className="text-xs text-white/60 truncate">{j.crews.join(', ') || '—'}</span>
            <span className="text-xs text-white/50 truncate">{j.metro || '—'}</span>
            <span className="text-xs text-white/50 truncate">{j.pm || '—'}</span>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-6 py-12 text-center text-white/30 text-sm">No jobs match your filters.</div>
      )}
      {filtered.length > 200 && (
        <div className="px-6 py-3 border-t border-white/[0.04] text-center text-white/30 text-xs">
          Showing first 200 of {filtered.length} jobs
        </div>
      )}
    </div>
  );
}
