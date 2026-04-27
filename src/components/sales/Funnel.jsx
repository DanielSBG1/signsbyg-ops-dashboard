import React, { useState, useMemo } from 'react';

const SOURCE_LABELS = {
  facebook: 'Facebook', paid_social_other: 'Paid Social', paid_search: 'Paid Search',
  email_extension: 'Email Prospecting', crm_manual: 'CRM Manual', integration: 'Integration',
  organic: 'Organic', direct: 'Direct', referrals: 'Referrals', walk_in: 'Walk-In',
  phone: 'Phone', repeat_client: 'Repeat Client', cold_outreach: 'Cold Outreach', other: 'Other',
};

// Row labels depend on the view. Cohort views (By Source, By Rep — Funnel)
// trace the same leads through stages; the "won" row counts contacts with
// an associated closed-won deal. Activity view tracks
// period-level creates/wins which can be much higher.
const COHORT_ROW_LABELS = ['New Leads', 'Became Deal', 'Became Customer'];
const ACTIVITY_ROW_LABELS = ['New Leads', 'Deals Created', 'Deals Won'];

function formatResponseTime(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatMoney(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount)}`;
}
const ROW_KEYS = ['leads', 'deals', 'won'];

// Distinct colors for reps when "By Rep" view is active.
// Cycles if there are more reps than colors.
const REP_COLORS = [
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ef4444', // red
  '#f59e0b', // amber
  '#22c55e', // green
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export default function Funnel({ funnel, funnelActivity, reps, onCellClick, activeCell }) {
  const [view, setView] = useState('source');  // 'source' | 'source_activity' | 'rep_funnel' | 'rep_activity'

  // Build rep datasets. The "metric" field triplet changes per view:
  // - rep_funnel: cohort fields + cohort revenue
  // - rep_activity: period activity fields + activity revenue
  function buildRepData(dealsKey, wonKey, revenueKey, avgKey, winKey) {
    if (!reps || reps.length === 0) return null;
    // Include reps with any activity — leads, deals created, or deals won.
    // Needed so the 'Unassigned' pseudo-rep shows up even with 0 leadsAssigned.
    const repsWithActivity = reps.filter(
      (r) => (r.leadsAssigned || 0) > 0 || (r.dealsCreated || 0) > 0 || (r.dealsWon || 0) > 0
    );
    if (repsWithActivity.length === 0) return null;
    const sortedReps = [...repsWithActivity].sort((a, b) => (b.leadsAssigned || 0) - (a.leadsAssigned || 0));
    const sources = sortedReps.map((r, i) => ({
      key: r.id,
      label: r.name,
      color: REP_COLORS[i % REP_COLORS.length],
      leads: r.leadsAssigned || 0,
      deals: r[dealsKey] || 0,
      won: r[wonKey] || 0,
      fbLeads: r.fbLeads || 0,
      organicLeads: r.organicLeads || 0,
      referralLeads: r.referralLeads || 0,
      avgResponseMinutes: r.avgResponseMinutes,
      revenue: r[revenueKey] || 0,
      avgDealSize: r[avgKey] || 0,
      winRate: r[winKey] ?? null,
    }));
    const totals = sources.reduce(
      (acc, s) => ({
        leads: acc.leads + s.leads,
        deals: acc.deals + s.deals,
        won: acc.won + s.won,
        fbLeads: acc.fbLeads + s.fbLeads,
        organicLeads: acc.organicLeads + s.organicLeads,
        referralLeads: acc.referralLeads + s.referralLeads,
      }),
      { leads: 0, deals: 0, won: 0, fbLeads: 0, organicLeads: 0, referralLeads: 0 }
    );
    return { sources, totals };
  }

  const repFunnelData = useMemo(
    () => buildRepData('cohortDeals', 'cohortWon', 'cohortRevenue', 'cohortAvgDealSize', 'cohortWinRate'),
    [reps]
  );
  const repActivityData = useMemo(
    () => buildRepData('dealsCreated', 'dealsWon', 'activityRevenue', 'activityAvgDealSize', 'activityWinRate'),
    [reps]
  );

  const activeData =
    view === 'rep_funnel' ? repFunnelData :
    view === 'rep_activity' ? repActivityData :
    view === 'source_activity' ? funnelActivity :
    funnel;
  const isRepView = view === 'rep_funnel' || view === 'rep_activity';
  const isCohortView = view === 'source' || view === 'rep_funnel';

  if (!activeData || !activeData.sources || activeData.sources.length === 0) return null;

  const { sources, totals } = activeData;

  // Find max value across all cells for bar scaling
  const maxVal = Math.max(
    ...sources.flatMap((s) => [s.leads, s.deals, s.won]),
    1
  );

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold">Conversion Funnel</h2>
            {isCohortView ? (
              <p className="text-white/30 text-[10px] mt-0.5">
                Cohort: same leads traced through stages. "Became Customer" counts contacts whose associated deal has reached a closed-won stage. Contacts without an associated deal — or with only open/lost deals — won't appear here.
              </p>
            ) : (
              <p className="text-white/30 text-[10px] mt-0.5">
                Activity: rows are <span className="italic">independent period counts</span>, not a cohort. "Won" can exceed "Deals Created" because you're closing deals built up in prior periods.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setView('source')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === 'source' ? 'bg-accent text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              By Source — Funnel
            </button>
            <button
              onClick={() => setView('source_activity')}
              disabled={!funnelActivity}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === 'source_activity' ? 'bg-accent text-white' : 'text-white/60 hover:text-white'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              By Source — Activity
            </button>
            <button
              onClick={() => setView('rep_funnel')}
              disabled={!repFunnelData}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === 'rep_funnel' ? 'bg-accent text-white' : 'text-white/60 hover:text-white'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              By Rep — Funnel
            </button>
            <button
              onClick={() => setView('rep_activity')}
              disabled={!repActivityData}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === 'rep_activity' ? 'bg-accent text-white' : 'text-white/60 hover:text-white'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              By Rep — Activity
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span>Leads: <span className="text-white font-medium">{totals.leads}</span></span>
          <span>Deals: <span className="text-white font-medium">{totals.deals}</span></span>
          <span>Won: <span className="text-white font-medium">{totals.won}</span></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-white/40 text-xs uppercase tracking-wider pb-3 px-2 w-32"></th>
              {sources.map((s) => (
                <th key={s.key} className="text-center pb-3 px-2">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-xs text-white/60 font-medium">{s.label}</span>
                    {s.originalSources && (
                      <span
                        className="text-[9px] text-white/30 leading-tight text-center max-w-[80px]"
                        title={Object.entries(s.originalSources).map(([k, v]) => `${SOURCE_LABELS[k] || k}: ${v}`).join(', ')}
                      >
                        {Object.entries(s.originalSources)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 2)
                          .map(([k, v]) => `${SOURCE_LABELS[k] || k} ${v}`)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="text-center pb-3 px-2">
                <span className="text-xs text-white/40 font-medium uppercase">Total</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(isCohortView ? COHORT_ROW_LABELS : ACTIVITY_ROW_LABELS).map((label, i) => {
              const rowKey = ROW_KEYS[i];
              const rowTotal = totals[rowKey];
              const prevRowTotal = i > 0 ? totals[ROW_KEYS[i - 1]] : null;
              const convRate = prevRowTotal > 0 ? Math.round((rowTotal / prevRowTotal) * 100) : null;

              return (
                <tr key={rowKey} className="border-t border-white/5">
                  <td className="py-4 px-2">
                    <div className="text-white/80 font-medium text-sm">{label}</div>
                    {convRate !== null && (
                      <div className="text-white/30 text-xs mt-0.5">
                        {convRate}% {i === 1 ? 'conversion' : 'close rate'}
                      </div>
                    )}
                  </td>
                  {sources.map((s) => {
                    const val = s[rowKey];
                    const barWidth = maxVal > 0 ? Math.max(val > 0 ? 8 : 0, (val / maxVal) * 100) : 0;
                    const prevVal = i > 0 ? s[ROW_KEYS[i - 1]] : null;
                    const cellRate = prevVal > 0 ? Math.round((val / prevVal) * 100) : null;

                    return (
                      <td key={s.key} className="py-4 px-2 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {isRepView && i === 0 && val > 0 && (
                            <span className="text-[10px] text-white/50 tabular-nums">
                              <span style={{ color: '#1877F2' }}>f</span> {s.fbLeads} · 🌐 {s.organicLeads} · 👤 {s.referralLeads}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={val === 0 || !onCellClick}
                            onClick={() => onCellClick && onCellClick({
                              type: isRepView ? 'rep' : 'source',
                              key: s.key,
                              label: s.label,
                              row: rowKey,
                              view, // 'source' | 'rep_funnel' | 'rep_activity'
                            })}
                            className={`text-white font-semibold text-lg tabular-nums hover:text-accent transition-colors disabled:cursor-default disabled:hover:text-white ${
                              activeCell && activeCell.key === s.key && activeCell.row === rowKey ? 'text-accent underline' : ''
                            }`}
                          >
                            {val}
                          </button>
                          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${barWidth}%`,
                                backgroundColor: s.color,
                                opacity: i === 0 ? 1 : i === 1 ? 0.7 : 0.5,
                              }}
                            />
                          </div>
                          {cellRate !== null && val > 0 && (
                            <span className="text-white/25 text-xs">{cellRate}%</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-4 px-2 text-center">
                    <button
                      type="button"
                      disabled={rowTotal === 0 || !onCellClick}
                      onClick={() => onCellClick && onCellClick({
                        type: 'total',
                        key: null,
                        label: 'All',
                        row: rowKey,
                        view,
                      })}
                      className={`text-white font-bold text-xl tabular-nums hover:text-accent transition-colors disabled:cursor-default disabled:hover:text-white ${
                        activeCell && activeCell.type === 'total' && activeCell.row === rowKey ? 'text-accent underline' : ''
                      }`}
                    >
                      {rowTotal}
                    </button>
                  </td>
                </tr>
              );
            })}
            {isRepView && (
              <tr className="border-t border-white/5">
                <td className="py-3 px-2">
                  <div className="text-white/80 font-medium text-sm">Avg Response</div>
                  <div className="text-white/30 text-xs mt-0.5">created → first contacted</div>
                </td>
                {sources.map((s) => (
                  <td key={s.key} className="py-3 px-2 text-center">
                    <span className="text-white/80 text-sm tabular-nums">
                      {formatResponseTime(s.avgResponseMinutes)}
                    </span>
                  </td>
                ))}
                <td className="py-3 px-2 text-center text-white/30 text-sm">—</td>
              </tr>
            )}
            {sources.some((s) => s.winRate != null || s.revenue != null) && (
              <>
                <tr className="border-t border-white/10">
                  <td className="py-3 px-2">
                    <div className="text-white/80 font-medium text-sm">Win Rate</div>
                    <div className="text-white/30 text-xs mt-0.5">won ÷ (won + lost)</div>
                  </td>
                  {sources.map((s) => (
                    <td key={s.key} className="py-3 px-2 text-center">
                      <button
                        type="button"
                        disabled={s.winRate == null || !onCellClick}
                        onClick={() => onCellClick && onCellClick({
                          type: isRepView ? 'rep' : 'source',
                          key: s.key,
                          label: s.label,
                          row: 'decided', // won + lost
                          view,
                        })}
                        className={`text-sm font-semibold tabular-nums hover:underline disabled:cursor-default ${
                          s.winRate == null ? 'text-white/30' :
                          s.winRate >= 50 ? 'text-success' :
                          s.winRate >= 25 ? 'text-yellow-400' : 'text-danger'
                        }`}
                      >
                        {s.winRate == null ? '—' : `${s.winRate}%`}
                      </button>
                    </td>
                  ))}
                  <td className="py-3 px-2 text-center">
                    <button
                      type="button"
                      disabled={!onCellClick}
                      onClick={() => onCellClick && onCellClick({ type: 'total', key: null, label: 'All', row: 'decided', view })}
                      className="text-white/40 text-sm hover:text-accent"
                    >
                      —
                    </button>
                  </td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-3 px-2">
                    <div className="text-white/80 font-medium text-sm">Avg Deal $</div>
                    <div className="text-white/30 text-xs mt-0.5">mean of won deals</div>
                  </td>
                  {sources.map((s) => (
                    <td key={s.key} className="py-3 px-2 text-center">
                      <button
                        type="button"
                        disabled={!(s.avgDealSize > 0) || !onCellClick}
                        onClick={() => onCellClick && onCellClick({
                          type: isRepView ? 'rep' : 'source',
                          key: s.key,
                          label: s.label,
                          row: 'won',
                          view,
                        })}
                        className="text-white/80 text-sm tabular-nums hover:text-accent hover:underline disabled:cursor-default disabled:hover:text-white/80"
                      >
                        {s.avgDealSize > 0 ? formatMoney(s.avgDealSize) : '—'}
                      </button>
                    </td>
                  ))}
                  <td className="py-3 px-2 text-center text-white/30 text-sm">—</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-3 px-2">
                    <div className="text-white/80 font-medium text-sm">Revenue</div>
                    <div className="text-white/30 text-xs mt-0.5">sum of won deal amounts</div>
                  </td>
                  {sources.map((s) => (
                    <td key={s.key} className="py-3 px-2 text-center">
                      <button
                        type="button"
                        disabled={!(s.revenue > 0) || !onCellClick}
                        onClick={() => onCellClick && onCellClick({
                          type: isRepView ? 'rep' : 'source',
                          key: s.key,
                          label: s.label,
                          row: 'won',
                          view,
                        })}
                        className="text-white font-semibold text-sm tabular-nums hover:text-accent hover:underline disabled:cursor-default disabled:hover:text-white"
                      >
                        {s.revenue > 0 ? formatMoney(s.revenue) : '—'}
                      </button>
                    </td>
                  ))}
                  <td className="py-3 px-2 text-center">
                    <button
                      type="button"
                      disabled={!onCellClick}
                      onClick={() => onCellClick && onCellClick({ type: 'total', key: null, label: 'All', row: 'won', view })}
                      className="font-bold text-white tabular-nums hover:text-accent hover:underline"
                    >
                      {formatMoney(sources.reduce((sum, s) => sum + (s.revenue || 0), 0))}
                    </button>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
