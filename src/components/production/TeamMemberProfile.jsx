import React, { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// ─── Constants ──────────────────────────────────────────────
const COLORS = {
  success: '#22c55e',
  danger:  '#ef4444',
  accent:  '#06b6d4',
  warning: '#eab308',
};

// ─── Helpers ────────────────────────────────────────────────

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

/** ISO date string → Date at midnight UTC */
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

/** Format "2025-07-07" → "Jul 7" */
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

// ─── Custom Tooltip ─────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#1a2035] border border-white/10 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-white/60 mb-1.5 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#fff' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({ title, children }) {
  return (
    <div className="bg-white/5 rounded-xl p-5">
      <p className="text-xs text-white/40 font-medium uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function TeamMemberProfile({ memberData, onClose }) {
  const {
    display, total, completed, onTime, late, open, overdue, onTimeRate, subtasks,
  } = memberData;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Avg days early/late ───────────────────────────────────
  const avgDaysEarlyLate = useMemo(() => {
    const completedWithDates = subtasks.filter(s => s.completed && s.due_on && s.completed_at);
    if (completedWithDates.length === 0) return null;
    const totalDiff = completedWithDates.reduce((sum, s) => {
      // positive = completed before due (early), negative = completed after due (late)
      return sum + diffDays(s.due_on, s.completed_at.slice(0, 10));
    }, 0);
    return totalDiff / completedWithDates.length;
  }, [subtasks]);

  // ── Weekly buckets ────────────────────────────────────────
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

    // Ensure at least 8 weeks — fill gaps
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

  // ── Completion speed per week ─────────────────────────────
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

  // ── Open tasks sorted by due date ─────────────────────────
  const openTasks = useMemo(() => {
    return subtasks
      .filter(s => !s.completed)
      .sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
  }, [subtasks]);

  // ── Days until due helper ─────────────────────────────────
  function daysUntilDue(dueOn) {
    if (!dueOn) return null;
    return diffDays(dueOn, today);
  }

  return (
    <div className="space-y-6">
      {/* ── 1. HEADER BAR ────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <span className="text-lg">&larr;</span> Back
        </button>
        <h2 className="text-2xl font-bold text-white flex-1">{display}</h2>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${rateBgClass(onTimeRate)}`}>
          {onTimeRate}% On-Time
        </span>
      </div>

      {/* ── 2. STAT CARDS ROW ────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Completion Rate">
          <p className={`text-3xl font-bold tabular-nums ${rateColorClass(onTimeRate)}`}>
            {onTimeRate}%
          </p>
          <p className="text-xs text-white/30 mt-1">
            {onTime} of {completed} completed on time
          </p>
        </StatCard>

        <StatCard title="Tasks Completed">
          <p className="text-3xl font-bold tabular-nums text-white">
            {completed}<span className="text-lg text-white/30">/{total}</span>
          </p>
          <p className="text-xs text-white/30 mt-1">
            {open} still open
          </p>
        </StatCard>

        <StatCard title="Avg Days Early/Late">
          {avgDaysEarlyLate !== null ? (
            <>
              <p className={`text-3xl font-bold tabular-nums ${avgDaysEarlyLate >= 0 ? 'text-success' : 'text-danger'}`}>
                {avgDaysEarlyLate >= 0 ? '+' : ''}{avgDaysEarlyLate.toFixed(1)}
              </p>
              <p className="text-xs text-white/30 mt-1">
                {avgDaysEarlyLate >= 0 ? 'days early on average' : 'days late on average'}
              </p>
            </>
          ) : (
            <p className="text-xl text-white/20 mt-2">&mdash;</p>
          )}
        </StatCard>

        <StatCard title="Overdue Now">
          <p className={`text-3xl font-bold tabular-nums ${overdue > 0 ? 'text-danger' : 'text-success'}`}>
            {overdue}
          </p>
          <p className="text-xs text-white/30 mt-1">
            {overdue > 0 ? 'tasks past due date' : 'all caught up'}
          </p>
        </StatCard>
      </div>

      {/* ── 3. ON-TIME RATE TREND CHART ──────────────────── */}
      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-4">On-Time Rate Over Time</h3>
        {weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={weeklyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="onTimeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.success} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(value, name) => {
                      if (name === 'onTimeRate') return `${value}%`;
                      return value;
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="onTimeRate"
                name="On-Time Rate"
                stroke={COLORS.success}
                strokeWidth={2}
                fill="url(#onTimeGradient)"
                connectNulls
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.onTimeRate === null) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={rateHexColor(payload.onTimeRate)}
                      stroke="none"
                    />
                  );
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-white/20 text-center py-12">No completion data yet</p>
        )}
      </div>

      {/* ── 4. WEEKLY BREAKDOWN CHART ────────────────────── */}
      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-4">Weekly Task Breakdown</h3>
        {weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="onTime" name="On Time" stackId="tasks" fill={COLORS.success} radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" name="Late" stackId="tasks" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-white/20 text-center py-12">No completion data yet</p>
        )}
      </div>

      {/* ── 5. COMPLETION SPEED CHART ────────────────────── */}
      <div className="bg-white/5 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white/70 mb-4">Avg Completion Speed (days)</h3>
        {speedData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={speedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(value) => {
                      if (value >= 0) return `${value} days early`;
                      return `${Math.abs(value)} days late`;
                    }}
                  />
                }
              />
              <Bar dataKey="avgDays" name="Avg Speed" radius={[4, 4, 0, 0]}>
                {speedData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.avgDays >= 0 ? COLORS.success : COLORS.danger}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-white/20 text-center py-12">No speed data available</p>
        )}
      </div>

      {/* ── 6. CURRENT TASKS TABLE ───────────────────────── */}
      <div className="bg-white/5 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white/70">
            Current Open Tasks
            <span className="ml-2 text-xs font-normal text-white/30">({openTasks.length})</span>
          </h3>
        </div>

        {openTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-white/30">
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
                    <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-sm text-white/80 truncate max-w-xs">{task.name}</p>
                        {task._parentName && (
                          <p className="text-[10px] text-white/25 truncate max-w-xs mt-0.5">
                            {task._parentName}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-white/50 whitespace-nowrap">
                        {fmtDate(task.due_on)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {daysLeft === null ? (
                          <span className="text-xs text-white/20">No date</span>
                        ) : isOverdue ? (
                          <span className="text-xs font-semibold text-danger">
                            {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} overdue
                          </span>
                        ) : daysLeft === 0 ? (
                          <span className="text-xs font-semibold text-warning">Due today</span>
                        ) : (
                          <span className="text-xs text-white/50">
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
          <p className="text-sm text-white/20 text-center py-8">No open tasks</p>
        )}
      </div>
    </div>
  );
}
