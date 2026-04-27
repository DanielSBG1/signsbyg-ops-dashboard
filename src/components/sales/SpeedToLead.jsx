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
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">⚡ Speed to Lead</h2>
        <p className="text-white/40 text-sm">No leads in this period yet.</p>
      </div>
    );
  }

  const compliance = sla.compliancePct ?? 0;
  const status =
    compliance >= 80 ? { color: 'text-success', bg: 'bg-success/10', label: 'On target' } :
    compliance >= 50 ? { color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Needs attention' } :
    { color: 'text-danger', bg: 'bg-danger/10', label: 'Critical' };

  // Pick which list to display based on selected bucket
  const bucketConfig = {
    within: {
      list: sla.withinLeads || [],
      total: sla.within,
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
      title: '🚨 Breaching SLA — call these now',
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
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">⚡ Speed to Lead</h2>
          <p className="text-white/40 text-xs mt-0.5">
            {sla.thresholdMinutes}-minute SLA · industry shows 9× conversion lift when contacted within 5 min
          </p>
        </div>
        <button
          onClick={() => setBucket('breaching')}
          title="Compliance status: ≥80% On target · 50-79% Needs attention · <50% Critical. Click to view breaching leads."
          className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-white/20 transition-all ${status.bg} ${status.color}`}
        >
          {status.label}
        </button>
      </div>

      {/* Top stats: compliance % + supporting */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white/5 rounded-xl p-4 col-span-2 md:col-span-1">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Compliance</p>
          <p className={`text-4xl font-bold tabular-nums ${status.color}`}>{compliance}%</p>
          <p className="text-white/40 text-xs mt-1">{sla.within} of {sla.total} within {sla.thresholdMinutes}m</p>
        </div>
        <ClickStat label="✓ Within SLA" value={sla.within} colorClass="text-success" subtext="contacted in time" active={bucket === 'within'} onClick={() => setBucket('within')} />
        <ClickStat label="⚠ Over SLA" value={sla.over} colorClass="text-yellow-400" subtext="contacted late" active={bucket === 'over'} onClick={() => setBucket('over')} />
        <ClickStat label="🚨 Breaching" value={sla.breaching} colorClass="text-danger" subtext="never contacted" active={bucket === 'breaching'} onClick={() => setBucket('breaching')} />
        <ClickStat label="🕒 In Window" value={sla.safe} colorClass="text-blue-300" subtext={`new, < ${sla.thresholdMinutes}m`} active={bucket === 'safe'} onClick={() => setBucket('safe')} />
        <Stat label="Median Response" value={formatResponseTime(sla.medianResponseMinutes)} valueClass="text-2xl" />
      </div>

      {/* Selected bucket list */}
      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${cfg.headerColor}`}>{cfg.title}</h3>
          {cfg.total > cfg.list.length && (
            <span className="text-white/40 text-xs">
              Showing first {cfg.list.length} of {cfg.total}
            </span>
          )}
        </div>
        {cfg.list.length === 0 ? (
          <p className="text-white/40 text-sm py-4">
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
                    if (diag.lifecycle) flags.push(`🔄 lifecycle: ${diag.lifecycle}`);
                    if (diag.numDeals > 0) flags.push(`💼 num deals: ${diag.numDeals}`);
                    if (diag.hasOpportunityDate) flags.push(`📈 opportunity date: ${diag.opportunityDateRaw || ''}`);
                    if (diag.hasOpenPhoneCheck) flags.push(diag.openPhoneMatched ? '📞 OpenPhone matched' : '📞 OpenPhone: no match');
                    if (diag.createdAtRaw) flags.push(`📅 created: ${diag.createdAtRaw}`);
                    const tooltip = flags.length > 0 ? flags.join('\n') : '';
                    return (
                      <tr key={lead.id} className={`border-t ${cfg.borderClass} ${cfg.hoverClass}`} title={tooltip}>
                        <td className="px-3 py-2 text-white font-medium">{lead.name}</td>
                        <td className="px-3 py-2 text-white/60">{lead.email}</td>
                        <td className="px-3 py-2 text-white/60">{lead.source}</td>
                        <td className={`px-3 py-2 ${lead.rep === 'Unassigned' ? 'text-danger font-semibold' : 'text-white/80'}`}>
                          {lead.rep}
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
      </div>
    </div>
  );
}

function Stat({ label, value, colorClass = 'text-white', valueClass = 'text-2xl', subtext }) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold tabular-nums ${valueClass} ${colorClass}`}>{value}</p>
      {subtext && <p className="text-white/40 text-xs mt-1">{subtext}</p>}
    </div>
  );
}

function ClickStat({ label, value, colorClass = 'text-white', subtext, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white/5 hover:bg-white/10 rounded-xl p-4 text-left transition-all w-full ${
        active ? 'ring-2 ring-accent' : ''
      }`}
    >
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold tabular-nums text-2xl ${colorClass}`}>{value}</p>
      {subtext && <p className="text-white/40 text-xs mt-1">{subtext}</p>}
    </button>
  );
}
