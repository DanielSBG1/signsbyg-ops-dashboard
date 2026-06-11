import React, { useState, useMemo } from 'react';

const STATUS_STYLES = {
  early:       'bg-success/20 text-success',
  on_time:     'bg-success/20 text-success',
  scheduled:   'bg-accent/20 text-accent',
  at_risk:     'bg-warning/20 text-warning',
  pending:     'bg-white/10 text-white/40',
  late:        'bg-danger/20 text-danger',
  rescheduled: 'bg-warning/20 text-warning',
  bled_over:   'bg-danger/20 text-danger',
  failed:      'bg-danger/20 text-danger',
};

const STATUS_LABELS = {
  early:       'Early',
  on_time:     'On Time',
  scheduled:   'Scheduled',
  at_risk:     'At Risk',
  pending:     'No Date',
  late:        'Late',
  rescheduled: 'Rescheduled',
  bled_over:   'Bled Over',
  failed:      'Failed',
};

const COLUMNS = [
  { key: 'name',        label: 'Job',          align: 'left' },
  { key: 'status',      label: 'Status',       align: 'left' },
  { key: 'section',     label: 'Section',      align: 'left' },
  { key: 'createdAt',   label: 'Created',      align: 'left' },
  { key: 'installDate', label: 'Install Date', align: 'left' },
  { key: 'reschedules', label: 'Resch.',       align: 'center' },
  { key: 'crews',       label: 'Crew',         align: 'left' },
  { key: 'metro',       label: 'Metro',        align: 'left' },
  { key: 'pm',          label: 'PM',           align: 'left' },
];

function getSortValue(job, key) {
  if (key === 'crews') return (job.crews || []).join(', ');
  if (key === 'reschedules') return job.reschedules || 0;
  return job[key] || '';
}

export default function JobsTable({ jobs }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter,   setCrewFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [sortKey,      setSortKey]      = useState('createdAt');
  const [sortDir,      setSortDir]      = useState('desc');

  if (!jobs) return null;

  const statuses = [...new Set(jobs.map(j => j.status))];
  const crews    = [...new Set(jobs.flatMap(j => j.crews))].filter(Boolean);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = jobs;
    if (statusFilter !== 'all') result = result.filter(j => j.status === statusFilter);
    if (crewFilter   !== 'all') result = result.filter(j => j.crews.includes(crewFilter));
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(j =>
        (j.name        || '').toLowerCase().includes(s) ||
        (j.address     || '').toLowerCase().includes(s) ||
        (j.contactName || '').toLowerCase().includes(s)
      );
    }
    return [...result].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [jobs, statusFilter, crewFilter, search, sortKey, sortDir]);

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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/[0.04]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`py-2 px-3 cursor-pointer hover:text-white/70 transition-colors select-none font-semibold ${
                    col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.slice(0, 200).map(j => (
              <tr key={j.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="py-3 px-3 min-w-0">
                  <a href={j.url} target="_blank" rel="noreferrer"
                    className="text-sm font-medium text-white hover:text-accent transition-colors truncate block">
                    {j.name}
                  </a>
                  {j.address && <p className="text-[11px] text-white/35 truncate mt-0.5">{j.address}</p>}
                </td>
                <td className="py-3 px-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit ${STATUS_STYLES[j.status] ?? 'bg-white/10 text-white/40'}`}>
                    {STATUS_LABELS[j.status] || j.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-xs text-white/50 truncate">{j.section || '\u2014'}</td>
                <td className="py-3 px-3 text-white/60 tabular-nums text-xs">
                  {j.createdAt
                    ? new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    : '\u2014'}
                </td>
                <td className="py-3 px-3 text-xs text-white/70 tabular-nums">{j.installDate || '\u2014'}</td>
                <td className="py-3 px-3 text-center tabular-nums text-xs">
                  {j.reschedules > 0 ? (
                    <span className={`font-bold ${j.reschedules >= 2 ? 'text-danger' : 'text-warning'}`}>{j.reschedules}</span>
                  ) : (
                    <span className="text-white/20">0</span>
                  )}
                </td>
                <td className="py-3 px-3 text-xs text-white/60 truncate">{(j.crews || []).join(', ') || '\u2014'}</td>
                <td className="py-3 px-3 text-xs text-white/50 truncate">{j.metro || '\u2014'}</td>
                <td className="py-3 px-3 text-xs text-white/50 truncate">{j.pm || '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
