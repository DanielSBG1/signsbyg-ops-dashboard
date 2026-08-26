import React, { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  success: '#22c55e',
  danger:  '#ef4444',
  accent:  '#06b6d4',
  warning: '#eab308',
};

const PERIODS = [
  { id: 'all',         label: 'All Time'      },
  { id: 'thisWeek',    label: 'This Week'     },
  { id: 'lastWeek',    label: 'Last Week'     },
  { id: '2weeksAgo',   label: '2 Weeks Ago'   },
  { id: 'thisMonth',   label: 'This Month'    },
  { id: 'lastMonth',   label: 'Last Month'    },
  { id: 'thisQuarter', label: 'This Quarter'  },
];

const LEADERBOARD_SORTS = [
  { key: 'firstTimeRate', label: 'First-Time %' },
  { key: 'callbacks',     label: 'Callbacks',     ascending: false },
  { key: 'onTimeRate',    label: 'On-Time %'    },
  { key: 'completed',     label: 'Completed'    },
  { key: 'open',          label: 'Open'         },
];

const MEDALS = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

const COMPLETED_STATUSES = new Set(['early', 'on_time', 'bled_over', 'rescheduled', 'failed']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateColorClass(rate) {
  if (rate >= 80) return 'text-success';
  if (rate >= 50) return 'text-warning';
  return 'text-danger';
}

function rateBgClass(rate) {
  if (rate >= 80) return 'bg-success/20 text-success';
  if (rate >= 50) return 'bg-warning/20 text-warning';
  return 'bg-danger/20 text-danger';
}

function rateHexColor(rate) {
  if (rate >= 80) return COLORS.success;
  if (rate >= 50) return COLORS.warning;
  return COLORS.danger;
}

function fmtDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtWeekLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Period math ──────────────────────────────────────────────────────────────

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getPeriodRange(periodId, today) {
  const monday = getMondayOf(today);
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);
  const qStart = ['01', '04', '07', '10'][Math.ceil(Number(month) / 3) - 1];
  const qEnd = ['03', '06', '09', '12'][Math.ceil(Number(month) / 3) - 1];
  const qEndDay = new Date(Number(year), Number(qEnd), 0).getDate();

  switch (periodId) {
    case 'thisWeek':    return { start: monday, end: addDays(monday, 6) };
    case 'lastWeek':    return { start: addDays(monday, -7), end: addDays(monday, -1) };
    case '2weeksAgo':   return { start: addDays(monday, -14), end: addDays(monday, -8) };
    case 'thisMonth':   return { start: `${year}-${month}-01`, end: today };
    case 'lastMonth': {
      const lm = Number(month) === 1 ? 12 : Number(month) - 1;
      const ly = Number(month) === 1 ? Number(year) - 1 : Number(year);
      const lmEnd = new Date(ly, lm, 0).getDate();
      return {
        start: `${ly}-${String(lm).padStart(2, '0')}-01`,
        end:   `${ly}-${String(lm).padStart(2, '0')}-${lmEnd}`,
      };
    }
    case 'thisQuarter':
      return {
        start: `${year}-${qStart}-01`,
        end:   `${year}-${qEnd}-${String(qEndDay).padStart(2, '0')}`,
      };
    case 'all':
    default: return null;
  }
}

function jobInRange(job, range) {
  if (!range) return true;
  const d = job.installDate || '';
  return d >= range.start && d <= range.end;
}

// ─── Compute crew stats from jobs ─────────────────────────────────────────────

function computeCrewStats(crewName, jobs) {
  const crewJobs = jobs.filter(j => (j.crews ?? []).includes(crewName));
  const completedJobs = crewJobs.filter(j => COMPLETED_STATUSES.has(j.status));
  const openJobs = crewJobs.filter(j => !COMPLETED_STATUSES.has(j.status));

  // First-time completion: completed AND 0 reschedules
  // Statuses early, on_time, bled_over all count as first-try if reschedules === 0
  const firstTime = completedJobs.filter(j =>
    (j.reschedules ?? 0) === 0 &&
    (j.status === 'early' || j.status === 'on_time' || j.status === 'bled_over')
  ).length;

  // Callbacks: jobs with 1+ reschedules
  const callbacks = completedJobs.filter(j => (j.reschedules ?? 0) >= 1).length;

  // Service calls: jobs in the "Service" section assigned to this crew
  const serviceCalls = crewJobs.filter(j =>
    (j.section || '').toLowerCase().includes('service')
  ).length;

  // On-time: early + on_time
  const onTimeCount = completedJobs.filter(j => j.status === 'early' || j.status === 'on_time').length;

  const firstTimeRate = completedJobs.length > 0
    ? Math.round((firstTime / completedJobs.length) * 100)
    : 0;

  const onTimeRate = completedJobs.length > 0
    ? Math.round((onTimeCount / completedJobs.length) * 100)
    : 0;

  const callbackRate = completedJobs.length > 0
    ? Math.round((callbacks / completedJobs.length) * 100)
    : 0;

  return {
    name: crewName,
    jobs: crewJobs,
    total: crewJobs.length,
    completed: completedJobs.length,
    open: openJobs.length,
    firstTime,
    firstTimeRate,
    callbacks,
    callbackRate,
    serviceCalls,
    onTimeCount,
    onTimeRate,
  };
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-500 mb-1.5 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#111827' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ title, children }) {
  return (
    <div className="bg-black/[0.03] rounded-xl p-5">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────

function SortHeader({ label, sortKey, currentSort, currentDir, onSort, className }) {
  const isActive = currentSort === sortKey;
  const arrow = isActive ? (currentDir === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <span
      className={`cursor-pointer select-none hover:text-white/60 transition-colors ${isActive ? 'text-accent' : ''} ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      {label}{arrow}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  early:       { label: 'Early',       cls: 'bg-success/20 text-success' },
  on_time:     { label: 'On Time',     cls: 'bg-success/20 text-success' },
  bled_over:   { label: 'Bled Over',   cls: 'bg-warning/20 text-warning' },
  scheduled:   { label: 'Scheduled',   cls: 'bg-accent/20 text-accent' },
  pending:     { label: 'No Date',     cls: 'bg-black/[0.05] text-gray-500' },
  late:        { label: 'Late',        cls: 'bg-danger/20 text-danger' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-warning/20 text-warning' },
  failed:      { label: 'Failed',      cls: 'bg-danger/20 text-danger' },
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function InstallerLeaderboard({ crews, sortKey, onSortChange, onViewProfile, onCrewClick }) {
  const sortOpt = LEADERBOARD_SORTS.find(o => o.key === sortKey);

  const sorted = useMemo(() => {
    return [...crews].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortOpt?.ascending === false ? av - bv : bv - av;
    });
  }, [crews, sortKey, sortOpt]);

  const maxVal = Math.max(...sorted.map(m => m[sortKey] ?? 0), 1);

  if (sorted.length === 0) return null;

  function barColor(crew) {
    if (crew.firstTimeRate >= 80) return 'bg-success';
    if (crew.firstTimeRate >= 50) return 'bg-warning';
    return 'bg-danger';
  }

  function fmtValue(crew, key) {
    if (key === 'firstTimeRate' || key === 'onTimeRate') return `${crew[key]}%`;
    return crew[key] ?? 0;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      {/* Header + sort pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Installer Leaderboard</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs mr-1">Sort:</span>
          {LEADERBOARD_SORTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSortChange(opt.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sortKey === opt.key
                  ? 'bg-accent text-white'
                  : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium -- top 3 */}
      {sorted.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {sorted.slice(0, 3).map((crew, idx) => (
            <div
              key={crew.name}
              className="bg-black/[0.03] rounded-xl p-4 text-center cursor-pointer hover:bg-black/[0.05] transition-colors"
              onClick={() => onCrewClick(crew.name)}
            >
              <span className="text-2xl">{MEDALS[idx]}</span>
              <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{crew.name}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${rateColorClass(crew.firstTimeRate)}`}>
                {fmtValue(crew, sortKey)}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px]">
                <div><span className="text-gray-500">1st-Time</span> <span className="text-success/70">{crew.firstTime}</span></div>
                <div><span className="text-gray-500">Callbacks</span> <span className={crew.callbacks > 0 ? 'text-warning' : 'text-gray-500'}>{crew.callbacks}</span></div>
                <div><span className="text-gray-500">Done</span> <span className="text-gray-500">{crew.completed}</span></div>
                <div><span className="text-gray-500">Open</span> <span className="text-gray-500">{crew.open}</span></div>
                {crew.serviceCalls > 0 && (
                  <div className="col-span-2"><span className="text-gray-500">Service</span> <span className="text-danger">{crew.serviceCalls}</span></div>
                )}
              </div>
              <button
                className="text-[10px] text-accent hover:underline mt-2"
                onClick={(e) => { e.stopPropagation(); onViewProfile(crew.name); }}
              >
                View Stats &rarr;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Remaining rows */}
      <div className="space-y-0.5">
        {sorted.slice(sorted.length >= 3 ? 3 : 0).map((crew, idx) => {
          const rank = (sorted.length >= 3 ? 3 : 0) + idx;
          const rawVal = crew[sortKey] ?? 0;
          const barPct = maxVal > 0 ? (rawVal / maxVal) * 100 : 0;
          const color = barColor(crew);

          return (
            <div
              key={crew.name}
              className="group relative rounded-lg px-3 py-2 cursor-pointer transition-all bg-black/[0.02] hover:bg-black/[0.05]"
              onClick={() => onCrewClick(crew.name)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 shrink-0 text-center">
                  <span className="text-gray-500 text-[10px] font-mono">#{rank + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-500 truncate leading-none mb-1.5">{crew.name}</div>
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${Math.max(barPct, barPct > 0 ? 1.5 : 0)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-x-2 mt-1 text-[10px] text-gray-500 leading-none">
                    <span><span className="text-gray-500">{crew.completed}</span> done</span>
                    <span><span className="text-gray-500">{crew.open}</span> open</span>
                    {crew.callbacks > 0 && <span className="text-warning">{crew.callbacks} callback{crew.callbacks !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xl font-bold tabular-nums leading-none ${rateColorClass(crew.firstTimeRate)}`}>
                    {fmtValue(crew, sortKey)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Crew section (expandable job list) ───────────────────────────────────────

function CrewSection({ crew, expanded, onToggle, onViewProfile, sectionRef }) {
  const [sortKey, setSortKey] = useState('installDate');
  const [sortDir, setSortDir] = useState('desc');

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedJobs = useMemo(() => {
    const jobs = [...crew.jobs];
    jobs.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'installDate':
          av = a.installDate || '9999';
          bv = b.installDate || '9999';
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'status':
          av = a.status || '';
          bv = b.status || '';
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'reschedules':
          av = a.reschedules ?? 0;
          bv = b.reschedules ?? 0;
          return sortDir === 'asc' ? av - bv : bv - av;
        default:
          return 0;
      }
    });
    return jobs;
  }, [crew.jobs, sortKey, sortDir]);

  return (
    <div ref={sectionRef} className="bg-black/[0.02] rounded-xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-black/[0.04] transition-colors text-left"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold text-gray-800 shrink-0">{crew.name}</span>
        {crew.open > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold shrink-0">
            {crew.open} open
          </span>
        )}
        {crew.callbacks > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-bold shrink-0">
            {crew.callbacks} callback{crew.callbacks !== 1 ? 's' : ''}
          </span>
        )}
        <span
          className="text-[10px] text-accent hover:underline cursor-pointer shrink-0"
          onClick={(e) => { e.stopPropagation(); onViewProfile?.(); }}
        >
          View Stats &rarr;
        </span>
        <span className="flex-1" />
        <span className={`text-xs font-semibold tabular-nums ${rateColorClass(crew.firstTimeRate)}`}>
          {crew.firstTimeRate}%
        </span>
        <span className="shrink-0 text-gray-500 text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          <div className="px-4 py-2 grid grid-cols-[1fr_90px_90px_70px] gap-2 text-[10px] uppercase tracking-wider text-gray-500">
            <SortHeader label="Job" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Install Date" sortKey="installDate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Resch." sortKey="reschedules" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>

          {sortedJobs.map((job, idx) => {
            const badge = STATUS_BADGE[job.status] ?? { label: job.status || 'Unknown', cls: 'bg-white/10 text-white/40' };
            return (
              <a
                key={job.id ?? idx}
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="block px-4 py-2 grid grid-cols-[1fr_90px_90px_70px] gap-2 items-center border-t border-gray-100 hover:bg-black/[0.02] transition-colors"
              >
                <span className="text-xs text-gray-700 truncate">{job.name}</span>
                <span className="text-xs tabular-nums text-gray-500">{fmtDate(job.installDate)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold w-fit ${badge.cls}`}>{badge.label}</span>
                <span className="text-xs tabular-nums text-center">
                  {(job.reschedules ?? 0) > 0
                    ? <span className={`font-bold ${(job.reschedules ?? 0) >= 2 ? 'text-danger' : 'text-warning'}`}>{job.reschedules}</span>
                    : <span className="text-gray-500">0</span>
                  }
                </span>
              </a>
            );
          })}

          {sortedJobs.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-500">No jobs</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Crew profile page ────────────────────────────────────────────────────────

function CrewProfile({ crew, allJobs, onClose }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [activePeriod, setActivePeriod] = useState('all');
  const periodRange = useMemo(() => getPeriodRange(activePeriod, today), [activePeriod, today]);

  // Filter jobs by period
  const filteredJobs = useMemo(() => {
    const crewJobs = allJobs.filter(j => (j.crews ?? []).includes(crew.name));
    if (!periodRange) return crewJobs;
    return crewJobs.filter(j => jobInRange(j, periodRange));
  }, [allJobs, crew.name, periodRange]);

  // Recompute stats from filtered jobs
  const stats = useMemo(() => computeCrewStats(crew.name, filteredJobs.length > 0 ? filteredJobs : []), [crew.name, filteredJobs]);

  // Use filteredJobs directly for stats since computeCrewStats would re-filter.
  // Instead, compute directly from filteredJobs.
  const completedJobs = useMemo(() => filteredJobs.filter(j => COMPLETED_STATUSES.has(j.status)), [filteredJobs]);
  const openJobs = useMemo(() => filteredJobs.filter(j => !COMPLETED_STATUSES.has(j.status)), [filteredJobs]);

  const firstTime = useMemo(() => completedJobs.filter(j =>
    (j.reschedules ?? 0) === 0 &&
    (j.status === 'early' || j.status === 'on_time' || j.status === 'bled_over')
  ).length, [completedJobs]);

  const callbacks = useMemo(() => completedJobs.filter(j => (j.reschedules ?? 0) >= 1).length, [completedJobs]);

  const onTimeCount = useMemo(() => completedJobs.filter(j => j.status === 'early' || j.status === 'on_time').length, [completedJobs]);

  const firstTimeRate = completedJobs.length > 0 ? Math.round((firstTime / completedJobs.length) * 100) : 0;
  const onTimeRate = completedJobs.length > 0 ? Math.round((onTimeCount / completedJobs.length) * 100) : 0;

  // Weekly trend data: first-time completion rate over weeks
  const weeklyData = useMemo(() => {
    const buckets = {};
    for (const j of completedJobs) {
      if (!j.installDate) continue;
      const d = new Date(j.installDate + 'T12:00:00Z');
      const dow = d.getUTCDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() + diff);
      const weekKey = monday.toISOString().slice(0, 10);

      if (!buckets[weekKey]) {
        buckets[weekKey] = { week: weekKey, completed: 0, firstTime: 0, onTime: 0, callbacks: 0 };
      }
      buckets[weekKey].completed++;
      if ((j.reschedules ?? 0) === 0 && (j.status === 'early' || j.status === 'on_time' || j.status === 'bled_over')) {
        buckets[weekKey].firstTime++;
      }
      if (j.status === 'early' || j.status === 'on_time') {
        buckets[weekKey].onTime++;
      }
      if ((j.reschedules ?? 0) >= 1) {
        buckets[weekKey].callbacks++;
      }
    }

    const sorted = Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week));

    // Fill gaps for at least 8 weeks
    if (sorted.length > 0) {
      const lastWeek = new Date(sorted[sorted.length - 1].week + 'T00:00:00Z');
      const minStart = new Date(lastWeek);
      minStart.setUTCDate(minStart.getUTCDate() - 7 * 7);
      const firstWeek = new Date(sorted[0].week + 'T00:00:00Z');
      const effectiveStart = firstWeek < minStart ? firstWeek : minStart;

      const allWeeks = [];
      const cursor = new Date(effectiveStart);
      while (cursor <= lastWeek) {
        const key = cursor.toISOString().slice(0, 10);
        const existing = buckets[key];
        allWeeks.push(existing || { week: key, completed: 0, firstTime: 0, onTime: 0, callbacks: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      return allWeeks.map(w => ({
        ...w,
        label: fmtWeekLabel(w.week),
        firstTimeRate: w.completed > 0 ? Math.round((w.firstTime / w.completed) * 100) : null,
      }));
    }

    return sorted.map(w => ({
      ...w,
      label: fmtWeekLabel(w.week),
      firstTimeRate: w.completed > 0 ? Math.round((w.firstTime / w.completed) * 100) : null,
    }));
  }, [completedJobs]);

  // Job table: sortable
  const [tableSortKey, setTableSortKey] = useState('installDate');
  const [tableSortDir, setTableSortDir] = useState('desc');

  function handleTableSort(key) {
    if (tableSortKey === key) {
      setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortKey(key);
      setTableSortDir('desc');
    }
  }

  const sortedTableJobs = useMemo(() => {
    const jobs = [...filteredJobs];
    jobs.sort((a, b) => {
      let av, bv;
      switch (tableSortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'installDate':
          av = a.installDate || '9999';
          bv = b.installDate || '9999';
          return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'status':
          av = a.status || '';
          bv = b.status || '';
          return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'reschedules':
          av = a.reschedules ?? 0;
          bv = b.reschedules ?? 0;
          return tableSortDir === 'asc' ? av - bv : bv - av;
        default:
          return 0;
      }
    });
    return jobs;
  }, [filteredJobs, tableSortKey, tableSortDir]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span className="text-lg">&larr;</span> Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900 flex-1">{crew.name}</h2>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${rateBgClass(firstTimeRate)}`}>
          {firstTimeRate}% First-Time
        </span>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-white'
                : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="First-Time Rate">
          <p className={`text-3xl font-bold tabular-nums ${rateColorClass(firstTimeRate)}`}>
            {firstTimeRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {firstTime} of {completedJobs.length} completed first try
          </p>
        </StatCard>

        <StatCard title="Callbacks">
          <p className={`text-3xl font-bold tabular-nums ${callbacks > 0 ? 'text-warning' : 'text-success'}`}>
            {callbacks}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {callbacks > 0 ? 'jobs needed a return visit' : 'no return visits needed'}
          </p>
        </StatCard>

        <StatCard title="On-Time Rate">
          <p className={`text-3xl font-bold tabular-nums ${rateColorClass(onTimeRate)}`}>
            {onTimeRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {onTimeCount} of {completedJobs.length} on schedule
          </p>
        </StatCard>

        <StatCard title="Active Jobs">
          <p className="text-3xl font-bold tabular-nums text-gray-900">
            {openJobs.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {filteredJobs.length} total in period
          </p>
        </StatCard>
      </div>

      {/* Weekly trend chart: first-time completion rate */}
      <div className="bg-black/[0.03] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-4">First-Time Completion Rate Over Time</h3>
        {weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={weeklyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="ftRateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.success} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(0,0,0,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(0,0,0,0.1)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'rgba(0,0,0,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(0,0,0,0.1)' }}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(value, name) => {
                      if (name === 'First-Time Rate') return `${value}%`;
                      return value;
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="firstTimeRate"
                name="First-Time Rate"
                stroke={COLORS.success}
                strokeWidth={2}
                fill="url(#ftRateGradient)"
                connectNulls
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.firstTimeRate === null) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={rateHexColor(payload.firstTimeRate)}
                      stroke="none"
                    />
                  );
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">No completion data yet</p>
        )}
      </div>

      {/* Jobs table */}
      <div className="bg-black/[0.03] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-600">
            Jobs
            <span className="ml-2 text-xs font-normal text-gray-500">({filteredJobs.length})</span>
          </h3>
        </div>

        {filteredJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium cursor-pointer hover:text-gray-500" onClick={() => handleTableSort('name')}>
                    Job {tableSortKey === 'name' && (tableSortDir === 'asc' ? '\u2191' : '\u2193')}
                  </th>
                  <th className="px-6 py-3 font-medium cursor-pointer hover:text-gray-500" onClick={() => handleTableSort('installDate')}>
                    Install Date {tableSortKey === 'installDate' && (tableSortDir === 'asc' ? '\u2191' : '\u2193')}
                  </th>
                  <th className="px-6 py-3 font-medium cursor-pointer hover:text-gray-500" onClick={() => handleTableSort('status')}>
                    Status {tableSortKey === 'status' && (tableSortDir === 'asc' ? '\u2191' : '\u2193')}
                  </th>
                  <th className="px-6 py-3 font-medium text-center cursor-pointer hover:text-gray-500" onClick={() => handleTableSort('reschedules')}>
                    Resch. {tableSortKey === 'reschedules' && (tableSortDir === 'asc' ? '\u2191' : '\u2193')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedTableJobs.map((job, i) => {
                  const badge = STATUS_BADGE[job.status] ?? { label: job.status || 'Unknown', cls: 'bg-black/[0.05] text-gray-500' };
                  return (
                    <tr key={job.id ?? i} className="hover:bg-black/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <a href={job.url} target="_blank" rel="noreferrer" className="text-sm text-gray-700 hover:text-accent truncate block max-w-xs">
                          {job.name}
                        </a>
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                        {fmtDate(job.installDate)}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-6 py-3 text-center tabular-nums text-xs">
                        {(job.reschedules ?? 0) > 0
                          ? <span className={`font-bold ${(job.reschedules ?? 0) >= 2 ? 'text-danger' : 'text-warning'}`}>{job.reschedules}</span>
                          : <span className="text-gray-500">0</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">No jobs in this period</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InstallerScorecard({ data }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [activePeriod, setActivePeriod] = useState('all');
  const [leaderboardSort, setLeaderboardSort] = useState('firstTimeRate');
  const [profileCrew, setProfileCrew] = useState(null);

  const periodRange = useMemo(() => getPeriodRange(activePeriod, today), [activePeriod, today]);

  // Filter all jobs by period
  const filteredJobs = useMemo(() => {
    if (!data?.jobs) return [];
    if (!periodRange) return data.jobs;
    return data.jobs.filter(j => jobInRange(j, periodRange));
  }, [data, periodRange]);

  // Build crew list from data.byCrew or extract from jobs
  const crewNames = useMemo(() => {
    if (data?.byCrew && data.byCrew.length > 0) {
      return data.byCrew.map(c => c.name);
    }
    const set = new Set();
    for (const j of (data?.jobs ?? [])) {
      for (const c of (j.crews ?? [])) set.add(c);
    }
    return [...set].sort();
  }, [data]);

  // Compute stats per crew
  const crewStats = useMemo(() => {
    return crewNames
      .map(name => computeCrewStats(name, filteredJobs))
      .filter(c => c.total > 0);
  }, [crewNames, filteredJobs]);

  // Expandable sections
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const sectionRefs = useRef({});
  const [scrollTarget, setScrollTarget] = useState(null);

  useEffect(() => {
    if (scrollTarget && sectionRefs.current[scrollTarget]) {
      sectionRefs.current[scrollTarget].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    }
  }, [scrollTarget, expandedKeys]);

  const handleCrewClick = useCallback((name) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        setScrollTarget(name);
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((name) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (!data) {
    return <div className="text-center py-20 text-gray-500 text-sm">Loading installer data...</div>;
  }

  // Show crew profile when selected
  if (profileCrew) {
    const crew = crewStats.find(c => c.name === profileCrew);
    if (crew) {
      return (
        <CrewProfile
          crew={crew}
          allJobs={data.jobs ?? []}
          onClose={() => setProfileCrew(null)}
        />
      );
    }
  }

  if (crewStats.length === 0) {
    return <div className="text-center py-20 text-gray-500 text-sm">No installer data available.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-white'
                : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <InstallerLeaderboard
        crews={crewStats}
        sortKey={leaderboardSort}
        onSortChange={setLeaderboardSort}
        onViewProfile={(name) => setProfileCrew(name)}
        onCrewClick={(name) => handleCrewClick(name)}
      />

      {/* Per-crew expandable sections */}
      <div className="space-y-3">
        {crewStats.map(crew => (
          <CrewSection
            key={crew.name}
            crew={crew}
            expanded={expandedKeys.has(crew.name)}
            onToggle={() => toggleSection(crew.name)}
            onViewProfile={() => setProfileCrew(crew.name)}
            sectionRef={el => { sectionRefs.current[crew.name] = el; }}
          />
        ))}
      </div>
    </div>
  );
}
