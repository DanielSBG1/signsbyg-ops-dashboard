import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend);

// \u2500\u2500\u2500 Constants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nconst COLORS = {
  success: '#22c55e',
  danger:  '#ef4444',
  accent:  '#06b6d4',
  warning: '#eab308',
};

// \u2500\u2500\u2500 Helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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

/** ISO date string \u2192 Date at midnight UTC */
function parseDate(iso) {
  if (!iso) return null;
  return new Date(iso.slice(0, 10) + 'T00:00:00Z');
}

/** Return the Monday (ISO week start) for a given Date */
function getMonday(d) {
  const copy = new Date(d);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}

/** Format "2025-07-07" \u2192 "Jul 7" */
function fmtWeekLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Format ISO date for display */
function fmtDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Difference in calendar days between two ISO date strings */
function diffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

// \u2500\u2500\u2500 Stat Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function StatCard({ title, children }) {
  return (
    <div className="bg-black/[0.03] rounded-xl p-5">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

// \u2500\u2500\u2500 Main Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// \u2500\u2500\u2500 Period helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function getMondayOfDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getPeriodRange(periodId, today) {
  const monday = getMondayOfDate(today);
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);
  const qStart = ['01', '04', '07', '10'][Math.ceil(Number(month) / 3) - 1];
  const qEnd = ['03', '06', '09', '12'][Math.ceil(Number(month) / 3) - 1];
  const qEndDay = new Date(Number(year), Number(qEnd), 0).getDate();

  switch (periodId) {
    case 'thisWeek':    return { start: monday, end: addDaysStr(monday, 6) };
    case 'lastWeek':    return { start: addDaysStr(monday, -7), end: addDaysStr(monday, -1) };
    case '2weeksAgo':   return { start: addDaysStr(monday, -14), end: addDaysStr(monday, -8) };
    case 'thisMonth':   return { start: `${year}-${month}-01`, end: today };
    case 'lastMonth': {
      const lm = Number(month) === 1 ? 12 : Number(month) - 1;
      const ly = Number(month) === 1 ? Number(year) - 1 : Number(year);
      const lmEnd = new Date(ly, lm, 0).getDate();
      return { start: `${ly}-${String(lm).padStart(2,'0')}-01`, end: `${ly}-${String(lm).padStart(2,'0')}-${lmEnd}` };
    }
    case 'thisQuarter': return { start: `${year}-${qStart}-01`, end: `${year}-${qEnd}-${String(qEndDay).padStart(2,'0')}` };
    case 'all':
    default:            return null;
  }
}

const PROFILE_PERIODS = [
  { id: 'all',        label: 'All Time' },
  { id: 'thisWeek',   label: 'This Week' },
  { id: 'lastWeek',   label: 'Last Week' },
  { id: '2weeksAgo',  label: '2 Weeks Ago' },
  { id: 'thisMonth',  label: 'This Month' },
  { id: 'lastMonth',  label: 'Last Month' },
  { id: 'thisQuarter',label: 'This Quarter' },
];

function subtaskInPeriod(st, range) {
  if (!range) return true;
  const due = st.due_on || '';
  const done = st.completed_at ? st.completed_at.slice(0, 10) : '';
  return (due >= range.start && due <= range.end) || (done >= range.start && done <= range.end);
}

export default function TeamMemberProfile({ memberData, onClose }) {
  const { display, subtasks: allSubtasks } = memberData;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [activePeriod, setActivePeriod] = useState('all');
  const periodRange = useMemo(() => getPeriodRange(activePeriod, today), [activePeriod, today]);

  // Filter subtasks by selected period
  const subtasks = useMemo(
    () => allSubtasks.filter(st => subtaskInPeriod(st, periodRange)),
    [allSubtasks, periodRange],
  );

  // Recompute stats from filtered subtasks
  const completedArr = useMemo(() => subtasks.filter(s => s.completed), [subtasks]);
  const openArr = useMemo(() => subtasks.filter(s => !s.completed), [subtasks]);
  const onTimeArr = useMemo(() => completedArr.filter(s => s.due_on && s.completed_at && s.completed_at.slice(0, 10) <= s.due_on), [completedArr]);
  const lateArr = useMemo(() => completedArr.filter(s => !s.due_on || !s.completed_at || s.completed_at.slice(0, 10) > s.due_on), [completedArr]);
  const overdueArr = useMemo(() => openArr.filter(s => s.due_on && s.due_on < today), [openArr, today]);
  const total = subtasks.length;
  const completed = completedArr.length;
  const onTime = onTimeArr.length;
  const late = lateArr.length;
  const open = openArr.length;
  const overdue = overdueArr.length;
  const onTimeRate = (completed + overdue) > 0 ? Math.round((onTime / (completed + overdue)) * 100) : 0;

  // \u2500\u2500 Avg days early/late \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const avgDaysEarlyLate = useMemo(() => {
    const completedWithDates = subtasks.filter(s => s.completed && s.due_on && s.completed_at);
    if (completedWithDates.length === 0) return null;
    const totalDiff = completedWithDates.reduce((sum, s) => {
      // positive = completed before due (early), negative = completed after due (late)
      return sum + diffDays(s.due_on, s.completed_at.slice(0, 10));
    }, 0);
    return totalDiff / completedWithDates.length;
  }, [subtasks]);

  // \u2500\u2500 Weekly buckets \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const weeklyData = useMemo(() => {
    const buckets = {};

    const completedTasks = subtasks.filter(s => s.completed && s.completed_at);
    for (const s of completedTasks) {
      const completedDate = parseDate(s.completed_at);
      if (!completedDate) continue;
      const weekKey = getMonday(completedDate);

      if (!buckets[weekKey]) {
        buckets[weekKey] = { week: weekKey, completed: 0, onTime: 0, late: 0 };
      }
      buckets[weekKey].completed++;
      if (s.due_on && s.completed_at.slice(0, 10) <= s.due_on) {
        buckets[weekKey].onTime++;
      } else {
        buckets[weekKey].late++;
      }
    }

    // Sort weeks chronologically
    const sorted = Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week));

    // Ensure at least 8 weeks \u2014 fill gaps
    if (sorted.length > 0) {
      const firstWeek = new Date(sorted[0].week + 'T00:00:00Z');
      const lastWeek = new Date(sorted[sorted.length - 1].week + 'T00:00:00Z');

      // Extend to at least 8 weeks from the last data point
      const minStart = new Date(lastWeek);
      minStart.setUTCDate(minStart.getUTCDate() - 7 * 7); // 7 weeks before last
      const effectiveStart = firstWeek < minStart ? firstWeek : minStart;

      const allWeeks = [];
      const cursor = new Date(effectiveStart);
      while (cursor <= lastWeek) {
        const key = cursor.toISOString().slice(0, 10);
        const existing = buckets[key];
        allWeeks.push(existing || { week: key, completed: 0, onTime: 0, late: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      return allWeeks.map(w => ({
        ...w,
        label: fmtWeekLabel(w.week),
        onTimeRate: w.completed > 0 ? Math.round((w.onTime / w.completed) * 100) : null,
      }));
    }

    return sorted.map(w => ({
      ...w,
      label: fmtWeekLabel(w.week),
      onTimeRate: w.completed > 0 ? Math.round((w.onTime / w.completed) * 100) : null,
    }));
  }, [subtasks]);

  // \u2500\u2500 Completion speed per week \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const speedData = useMemo(() => {
    const buckets = {};

    const completedTasks = subtasks.filter(s => s.completed && s.completed_at && s.due_on);
    for (const s of completedTasks) {
      const completedDate = parseDate(s.completed_at);
      if (!completedDate) continue;
      const weekKey = getMonday(completedDate);

      if (!buckets[weekKey]) {
        buckets[weekKey] = { week: weekKey, totalDiff: 0, count: 0 };
      }
      buckets[weekKey].totalDiff += diffDays(s.due_on, s.completed_at.slice(0, 10));
      buckets[weekKey].count++;
    }

    return Object.values(buckets)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map(w => ({
        label: fmtWeekLabel(w.week),
        avgDays: parseFloat((w.totalDiff / w.count).toFixed(1)),
      }));
  }, [subtasks]);

  // \u2500\u2500 Open tasks sorted by due date \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const openTasks = useMemo(() => {
    return subtasks
      .filter(s => !s.completed)
      .sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
  }, [subtasks]);

  // \u2500\u2500 Days until due helper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function daysUntilDue(dueOn) {
    if (!dueOn) return null;
    return diffDays(dueOn, today);
  }

  return (
    <div className="space-y-6">
      {/* \u2500\u2500 1. HEADER BAR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span className="text-lg">&larr;</span> Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900 flex-1">{display}</h2>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${rateBgClass(onTimeRate)}`}>
          {onTimeRate}% On-Time
        </span>
      </div>

      {/* \u2500\u2500 PERIOD SELECTOR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="flex flex-wrap gap-1.5">
        {PROFILE_PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-gray-900'
                : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* \u2500\u2500 2. STAT CARDS ROW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Completion Rate">
          <p className={`text-3xl font-bold tabular-nums ${rateColorClass(onTimeRate)}`}>
            {onTimeRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {onTime} of {completed} completed on time
          </p>
        </StatCard>

        <StatCard title="Tasks Completed">
          <p className="text-3xl font-bold tabular-nums text-gray-900">
            {completed}<span className="text-lg text-gray-500">/{total}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {open} still open
          </p>
        </StatCard>

        <StatCard title="Avg Days Early/Late">
          {avgDaysEarlyLate !== null ? (
            <>
              <p className={`text-3xl font-bold tabular-nums ${avgDaysEarlyLate >= 0 ? 'text-success' : 'text-danger'}`}>
                {avgDaysEarlyLate >= 0 ? '+' : ''}{avgDaysEarlyLate.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {avgDaysEarlyLate >= 0 ? 'days early on average' : 'days late on average'}
              </p>
            </>
          ) : (
            <p className="text-xl text-gray-500 mt-2">&mdash;</p>
          )}
        </StatCard>

        <StatCard title="Overdue Now">
          <p className={`text-3xl font-bold tabular-nums ${overdue > 0 ? 'text-danger' : 'text-success'}`}>
            {overdue}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {overdue > 0 ? 'tasks past due date' : 'all caught up'}
          </p>
        </StatCard>
      </div>

      {/* \u2500\u2500 3. ON-TIME RATE TREND CHART \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="bg-black/[0.03] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-4">On-Time Rate Over Time</h3>
        {weeklyData.length > 0 ? (
          <div style={{ height: 250 }}>
            <Line
              data={{
                labels: weeklyData.map((w) => w.label),
                datasets: [
                  {
                    label: 'On-Time Rate',
                    data: weeklyData.map((w) => w.onTimeRate),
                    borderColor: COLORS.success,
                    backgroundColor: COLORS.success + '4d',
                    borderWidth: 2,
                    pointRadius: weeklyData.map((w) => (w.onTimeRate === null ? 0 : 4)),
                    pointBackgroundColor: weeklyData.map((w) =>
                      w.onTimeRate !== null ? rateHexColor(w.onTimeRate) : 'transparent'
                    ),
                    tension: 0,
                    fill: true,
                    spanGaps: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: '#1a2035',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    titleColor: '#6b7280',
                    bodyColor: '#ffffff',
                    callbacks: {
                      label: (ctx) => `On-Time Rate: ${ctx.parsed.y}%`,
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                  y: {
                    min: 0,
                    max: 100,
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 }, callback: (v) => `${v}%` },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                },
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">No completion data yet</p>
        )}
      </div>

      {/* \u2500\u2500 4. WEEKLY BREAKDOWN CHART \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="bg-black/[0.03] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-4">Weekly Task Breakdown</h3>
        {weeklyData.length > 0 ? (
          <div style={{ height: 250 }}>
            <Bar
              data={{
                labels: weeklyData.map((w) => w.label),
                datasets: [
                  {
                    label: 'On Time',
                    data: weeklyData.map((w) => w.onTime),
                    backgroundColor: COLORS.success,
                    stack: 'tasks',
                    borderRadius: 0,
                  },
                  {
                    label: 'Late',
                    data: weeklyData.map((w) => w.late),
                    backgroundColor: COLORS.danger,
                    stack: 'tasks',
                    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: '#1a2035',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    titleColor: '#6b7280',
                    bodyColor: '#ffffff',
                  },
                },
                scales: {
                  x: {
                    stacked: true,
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                  y: {
                    stacked: true,
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 }, precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                },
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">No completion data yet</p>
        )}
      </div>

      {/* \u2500\u2500 5. COMPLETION SPEED CHART \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="bg-black/[0.03] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-4">Avg Completion Speed (days)</h3>
        {speedData.length > 0 ? (
          <div style={{ height: 250 }}>
            <Bar
              data={{
                labels: speedData.map((w) => w.label),
                datasets: [
                  {
                    label: 'Avg Speed',
                    data: speedData.map((w) => w.avgDays),
                    backgroundColor: speedData.map((w) =>
                      w.avgDays >= 0 ? COLORS.success : COLORS.danger
                    ),
                    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: '#1a2035',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    titleColor: '#6b7280',
                    bodyColor: '#ffffff',
                    callbacks: {
                      label: (ctx) => {
                        const val = ctx.parsed.y;
                        if (val >= 0) return `Avg Speed: ${val} days early`;
                        return `Avg Speed: ${Math.abs(val)} days late`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                  y: {
                    ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    border: { color: 'rgba(255,255,255,0.1)' },
                  },
                },
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">No speed data available</p>
        )}
      </div>

      {/* \u2500\u2500 6. CURRENT TASKS TABLE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="bg-black/[0.03] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-600">
            Current Open Tasks
            <span className="ml-2 text-xs font-normal text-gray-500">({openTasks.length})</span>
          </h3>
        </div>

        {openTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium">Task</th>
                  <th className="px-6 py-3 font-medium">Due Date</th>
                  <th className="px-6 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {openTasks.map((task, i) => {
                  const daysLeft = daysUntilDue(task.due_on);
                  const isOverdue = daysLeft !== null && daysLeft < 0;

                  return (
                    <tr key={i} className="hover:bg-black/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-sm text-gray-700 truncate max-w-xs">{task.name}</p>
                        {task._parentName && (
                          <p className="text-[10px] text-gray-500 truncate max-w-xs mt-0.5">
                            {task._parentName}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(task.due_on)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {daysLeft === null ? (
                          <span className="text-xs text-gray-500">No date</span>
                        ) : isOverdue ? (
                          <span className="text-xs font-semibold text-danger">
                            {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} overdue
                          </span>
                        ) : daysLeft === 0 ? (
                          <span className="text-xs font-semibold text-warning">Due today</span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">No open tasks</p>
        )}
      </div>
    </div>
  );
}
