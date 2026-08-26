import React, { useState } from 'react';

function formatAge(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatResponseTime(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

const SLA_COMPLIANCE_THRESHOLDS = { onTarget: 80, attention: 50 };

/**
 * Speed-to-Lead SLA tracker.
 *
 * Top: big compliance % + supporting metrics
 * Bottom: list of leads currently breaching SLA — these are the urgent action items
 */
export default function SpeedToLead({ sla }) {
  const [showAll, setShowAll] = useState(false);
  const [bucket, setBucket] = useState('breaching'); // 'within' | 'over' | 'breaching' | 'safe'

  if (!sla || sla.total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">⚡ Speed to Lead</h2>
        <p className="text-gray-500 text-sm">No leads in this period yet.</p>
      </div>
    );
  }

  const compliance = sla.compliancePct ?? 0;
  const status =
    compliance >= SLA_COMPLIANCE_THRESHOLDS.onTarget ? { color: 'text-success', bg: 'bg-success/10', label: 'On target' } :
    compliance >= SLA_COMPLIANCE_THRESHOLDS.attention ? { color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Needs attention' } :
    { color: 'text-danger', bg: 'bg-danger/10', label: 'Critical' };

  // Pick which list to display based on selected bucket
  const bucketConfig = {
    within: {
      list: sla.withinLeads || [],
      total: sla.within,
      deals: sla.withinDeals ?? null,
      won: sla.withinWon ?? null,
      title: '✓ Within SLA — contacted in time',
      headerColor: 'text-success',
      bgClass: 'bg-success/5 border-success/20',
      headerBgClass: 'bg-success/10 text-success/80',
      hoverClass: 'hover:bg-success/10',
      borderClass: 'border-success/10',
      timeCol: { label: 'Response', accessor: (l) => formatAge(l.responseMinutes) },
    },
    over: {
      list: sla.overLeads || [],
      total: sla.over,
      deals: sla.overDeals ?? null,
      won: sla.overWon ?? null,
      title: '⚠ Over SLA — contacted late',
      headerColor: 'text-yellow-400',
      bgClass: 'bg-yellow-400/5 border-yellow-400/20',
      headerBgClass: 'bg-yellow-400/10 text-yellow-400/80',
      hoverClass: 'hover:bg-yellow-400/10',
      borderClass: 'border-yellow-400/10',
      timeCol: { label: 'Response', accessor: (l) => formatAge(l.responseMinutes) },
    },
    breaching: {
      list: sla.breachingLeads || [],
      total: sla.breachingTotal,
      deals: sla.breachingDeals ?? null,
      won: sla.breachingWon ?? null,
      title: sla.isHistorical ? '⏱ Never worked — historical breach' : '🚨 Breaching SLA — call these now',
      headerColor: 'text-danger',
      bgClass: 'bg-danger/5 border-danger/20',
      headerBgClass: 'bg-danger/10 text-danger/80',
      hoverClass: 'hover:bg-danger/10',
      borderClass: 'border-danger/10',
      timeCol: { label: 'Age', accessor: (l) => formatAge(l.ageMinutes) },
    },
    safe: {
      list: sla.safeLeads || [],
      total: sla.safe,
      deals: sla.safeDeals ?? null,
      won: sla.safeWon ?? null,
      title: '🕒 Within window — uncontacted but new',
      headerColor: 'text-blue-300',
      bgClass: 'bg-blue-300/5 border-blue-300/20',
      headerBgClass: 'bg-blue-300/10 text-blue-300/80',
      hoverClass: 'hover:bg-blue-300/10',
      borderClass: 'border-blue-300/10',
      timeCol: { label: 'Age', accessor: (l) => formatAge(l.ageMinutes) },
    },
  };
  const cfg = bucketConfig[bucket];
  const visibleLeads = showAll ? cfg.list : cfg.list.slice(0, 5);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">⚡ Speed to Lead</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {sla.sourceAware
              ? 'source-aware SLA · 5min web/social, 60min referral, 4hr cold'
              : `${sla.thresholdMinutes}-minute SLA · industry shows 9× conversion lift when contacted within 5 min`}
          </p>
        </div>
        <button
          onClick={() => setBucket('breaching')}
          title={`Compliance status: ≥${SLA_COMPLIANCE_THRESHOLDS.onTarget}% On target · ${SLA_COMPLIANCE_THRESHOLDS.attention}-${SLA_COMPLIANCE_THRESHOLDS.onTarget - 1}% Needs attention · <${SLA_COMPLIANCE_THRESHOLDS.attention}% Critical. Click to view breaching leads.`}
          className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-white/20 transition-all ${status.bg} ${status.color}`}
        >
          {status.label}
        </button>
      </div>

      {/* Top stats: compliance % + supporting */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-black/[0.03] rounded-xl p-4 col-span-2 md:col-span-1">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Compliance</p>
          <p className={`text-4xl font-bold tabular-nums ${status.color}`}>{compliance}%</p>
          <p className="text-gray-500 text-xs mt-1">
            {sla.within} of {sla.total} within SLA
          </p>
        </div>
        <ClickStat label="✓ Within SLA" value={sla.within} colorClass="text-success" subtext="contacted in time" deals={sla.withinDeals} won={sla.withinWon} active={bucket === 'within'} onClick={() => setBucket('within')} />
        <ClickStat label="⚠ Over SLA" value={sla.over} colorClass="text-yellow-400" subtext="contacted late" deals={sla.overDeals} won={sla.overWon} active={bucket === 'over'} onClick={() => setBucket('over')} />
        <ClickStat
          label="🚨 Breaching"
          value={sla.breaching}
          colorClass="text-danger"
          subtext={sla.isHistorical ? 'never contacted in period' : 'never contacted'}
          deals={sla.breachingDeals}
          won={sla.breachingWon}
          active={bucket === 'breaching'}
          onClick={() => setBucket('breaching')}
          partialSignal={sla.partialOpenPhoneSignal}
        />
        <ClickStat label="🕒 In Window" value={sla.safe} colorClass="text-blue-300" subtext={`new, < ${sla.thresholdMinutes}m`} deals={sla.safeDeals} won={sla.safeWon} active={bucket === 'safe'} onClick={() => setBucket('safe')} />
        <Stat label="Median Response" value={formatResponseTime(sla.medianResponseMinutes)} valueClass="text-2xl" />
      </div>

      {/* Selected bucket list */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${cfg.headerColor}`}>{cfg.title}</h3>
          <div className="flex items-center gap-3">
            {cfg.deals != null && (
              <span className="text-xs text-gray-500">
                <span className="text-green-400 font-semibold">{cfg.deals}</span>
                <span className="text-gray-500"> / {cfg.total} have deals</span>
              </span>
            )}
            {cfg.won != null && cfg.won > 0 && (
              <span className="text-xs text-gray-500">
                <span className="text-amber-400 font-semibold">{cfg.won}</span>
                <span className="text-gray-500"> won</span>
              </span>
            )}
            {cfg.total > cfg.list.length && (
              <span className="text-gray-500 text-xs">
                Showing first {cfg.list.length} of {cfg.total}
              </span>
            )}
          </div>
        </div>
        {cfg.list.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">
            {bucket === 'breaching' ? '✓ Zero leads currently breaching SLA. Keep it up.' : 'No leads in this bucket.'}
          </p>
        ) : (
          <>
            <div className={`${cfg.bgClass} border rounded-lg overflow-hidden`}>
              <table className="w-full text-xs">
                <thead className={`${cfg.headerBgClass} uppercase text-[10px] tracking-wider`}>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                    <th className="px-3 py-2 text-center font-medium">Deal</th>
                    <th className="px-3 py-2 text-center font-medium">Won</th>
                    <th className="px-3 py-2 text-right font-medium">{cfg.timeCol.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead) => {
                    const diag = lead.diagnostic || {};
                    const flags = [];
                    if (diag.hasNotesLastContacted) flags.push('📝 notes_last_contacted set');
                    if (diag.hasNotesLastUpdated) flags.push(`📝 notes_last_updated: ${diag.notesLastUpdatedRaw || ''}`);
                    if (diag.hasSalesActivityTs) flags.push('💼 sales activity ts set');
                    if (diag.hasEmailLastSend) flags.push('📧 email send set');
                    if (diag.leadStatus) flags.push(`🏷 lead_status: ${diag.leadStatus}`);
                    if (diag.lifecycle) flags.push(`🔄 lifecycle: ${diag.lifecycle}`);
                    if (diag.numDeals > 0) flags.push(`💼 num deals: ${diag.numDeals}`);
                    if (diag.hasOpportunityDate) flags.push(`📈 opportunity date: ${diag.opportunityDateRaw || ''}`);
                    if (diag.hasOpenPhoneCheck) flags.push(diag.openPhoneMatched ? '📞 OpenPhone matched' : '📞 OpenPhone: no match');
                    if (diag.createdAtRaw) flags.push(`📅 created: ${diag.createdAtRaw}`);
                    const tooltip = flags.length > 0 ? flags.join('\n') : '';
                    return (
                      <tr key={lead.id} className={`border-t ${cfg.borderClass} ${cfg.hoverClass}`} title={tooltip}>
                        <td className="px-3 py-2 text-gray-900 font-medium">{lead.name}</td>
                        <td className="px-3 py-2 text-gray-500">{lead.email}</td>
                        <td className="px-3 py-2 text-gray-500">{lead.source}</td>
                        <td className={`px-3 py-2 ${lead.rep === 'Unassigned' ? 'text-danger font-semibold' : 'text-gray-700'}`}>
                          {lead.rep}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {lead.numDeals > 0
                            ? <span className="text-green-400 font-semibold">{lead.numDeals}</span>
                            : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {lead.hasWon
                            ? <span className="text-amber-400 font-bold">✓</span>
                            : <span className="text-gray-500">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${cfg.headerColor}`}>
                          {cfg.timeCol.accessor(lead)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {cfg.list.length > 5 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="mt-2 text-xs text-accent hover:underline"
              >
                {showAll ? 'Show less' : `Show all ${cfg.list.length}`}
              </button>
            )}
          </>
        )}
      {/* Per-source SLA breakdown */}
      {sla.sourceBreakdown && sla.sourceBreakdown.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By Source</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 uppercase text-[10px] tracking-wider">
                  <th className="text-left pb-1.5 font-medium">Source</th>
                  <th className="text-right pb-1.5 font-medium">SLA</th>
                  <th className="text-right pb-1.5 font-medium">Total</th>
                  <th className="text-right pb-1.5 font-medium">Within</th>
                  <th className="text-right pb-1.5 font-medium">Over</th>
                  <th className="text-right pb-1.5 font-medium">Breaching</th>
                  <th className="text-right pb-1.5 font-medium">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {sla.sourceBreakdown.map((row) => {
                  const pct = row.compliancePct;
                  const pctColor = pct == null ? 'text-gray-500' : pct >= SLA_COMPLIANCE_THRESHOLDS.onTarget ? 'text-success' : pct >= SLA_COMPLIANCE_THRESHOLDS.attention ? 'text-yellow-400' : 'text-danger';
                  const threshold = row.thresholdMinutes >= 60
                    ? `${row.thresholdMinutes / 60}h`
                    : `${row.thresholdMinutes}m`;
                  return (
                    <tr key={row.source} className="border-t border-gray-200 hover:bg-black/[0.03]">
                      <td className="py-1.5 pr-3 text-gray-600">
                        {row.source === 'Source not set'
                          ? <span className="text-gray-500 italic">{row.source}</span>
                          : row.source}
                      </td>
                      <td className="py-1.5 text-right text-gray-500 tabular-nums">{threshold}</td>
                      <td className="py-1.5 text-right text-gray-500 tabular-nums">{row.total}</td>
                      <td className="py-1.5 text-right text-success/80 tabular-nums">{row.within}</td>
                      <td className="py-1.5 text-right text-yellow-400/80 tabular-nums">{row.over}</td>
                      <td className="py-1.5 text-right text-danger/80 tabular-nums">{row.breaching}</td>
                      <td className={`py-1.5 text-right font-semibold tabular-nums ${pctColor}`}>
                        {pct != null ? `${pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sla.sourceBreakdown.some((r) => r.source === 'Source not set') && (
            <p className="text-gray-500 text-[10px] mt-2 italic">
              "Source not set" uses the default 5-min threshold. Populate the SBG Lead Source field in HubSpot to get per-source compliance.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function Stat({ label, value, colorClass = 'text-gray-900', valueClass = 'text-2xl', subtext }) {
  return (
    <div className="bg-black/[0.03] rounded-xl p-4">
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold tabular-nums ${valueClass} ${colorClass}`}>{value}</p>
      {subtext && <p className="text-gray-500 text-xs mt-1">{subtext}</p>}
    </div>
  );
}

function ClickStat({ label, value, colorClass = 'text-gray-900', subtext, deals, won, active, onClick, partialSignal }) {
  return (
    <button
      onClick={onClick}
      className={`bg-black/[0.03] hover:bg-black/[0.05] rounded-xl p-4 text-left transition-all w-full ${
        active ? 'ring-2 ring-accent' : ''
      }`}
    >
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold tabular-nums text-2xl ${colorClass}`}>{value}</p>
      {subtext && <p className="text-gray-500 text-xs mt-1">{subtext}</p>}
      {deals != null && (
        <p className="text-gray-500 text-[10px] mt-1.5 tabular-nums">
          {deals} deals{won > 0 ? ` · ${won} won` : ''}
        </p>
      )}
      {partialSignal && (
        <p
          className="text-yellow-400/70 text-[10px] mt-1.5"
          title="OpenPhone/Gmail polling timed out — breach count may be over-stated"
        >
          ⚠ partial OP/Gmail data
        </p>
      )}
    </button>
  );
}
