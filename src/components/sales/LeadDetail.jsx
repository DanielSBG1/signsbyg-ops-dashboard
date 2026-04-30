import React, { useState, useEffect } from 'react';

const SOURCE_LABELS = {
  facebook: 'Facebook',
  paid_social_other: 'Paid Social',
  email_extension: 'Email Prospecting',
  crm_manual: 'CRM Manual',
  integration: 'Integration',
  organic: 'Organic',
  direct: 'Direct / Website',
  referrals: 'Referral',
  other: 'Other',
};

const SOURCE_COLORS = {
  facebook: 'bg-blue-500/20 text-blue-300',
  paid_social_other: 'bg-purple-500/20 text-purple-300',
  email_extension: 'bg-amber-500/20 text-amber-300',
  crm_manual: 'bg-red-500/20 text-red-300',
  integration: 'bg-indigo-500/20 text-indigo-300',
  organic: 'bg-green-500/20 text-green-300',
  direct: 'bg-cyan-500/20 text-cyan-300',
  referrals: 'bg-orange-500/20 text-orange-300',
  other: 'bg-white/10 text-white/60',
};

const STATUS_LABELS = {
  qualified: 'Qualified',
  new_lead: 'New Lead',
  manual_entry: 'Manual Entry',
  unqualified: 'Unqualified',
  internal: 'Internal',
};

const STATUS_COLORS = {
  qualified: 'bg-green-500/20 text-green-300 border-green-500/30',
  new_lead: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  manual_entry: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  unqualified: 'bg-white/10 text-white/40 border-white/10',
  internal: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function LeadDetail({ leads, leadCounts, leadsOmitted, repLeads, repLeadsLoading, filterRep, statusHint, onClearFilter, funnelFilter, onClearFunnelFilter }) {
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // When a rep is selected from the leaderboard, auto-apply the status hint
  // (e.g. Revenue/Won sort → "qualified"; Leads/Resp Time sort → "new_lead").
  // When rep is deselected, reset to all.
  useEffect(() => {
    if (filterRep) setStatusFilter(statusHint || 'all');
    else setStatusFilter('all');
  }, [filterRep, statusHint]);

  // For wide periods with a rep selected, use repLeads from the dedicated endpoint.
  // repLeads are already scoped to the rep — no client-side rep filter needed.
  const isRepLeadsMode = leadsOmitted && !!filterRep;
  const activeLeads = isRepLeadsMode ? (repLeads || []) : (leads || []);
  const showTable = !leadsOmitted || isRepLeadsMode;

  if (!leadsOmitted && (!leads || leads.length === 0)) return null;
  if (leadsOmitted && !filterRep && !funnelFilter) return null;

  let filtered = isRepLeadsMode ? activeLeads : (filterRep ? activeLeads.filter((l) => l.repId === filterRep) : activeLeads);
  if (sourceFilter !== 'all') filtered = filtered.filter((l) => l.source === sourceFilter);
  if (statusFilter !== 'all') filtered = filtered.filter((l) => l.status === statusFilter);
  if (funnelFilter && !isRepLeadsMode) {
    if (funnelFilter.type === 'source') {
      filtered = filtered.filter((l) => l.source === funnelFilter.key);
    } else if (funnelFilter.type === 'rep') {
      filtered = filtered.filter((l) => l.repId === funnelFilter.key);
    } else if (funnelFilter.type === 'metric') {
      // Metric card clicks — filter by specific source groupings
      if (funnelFilter.key === 'facebookLeads') {
        filtered = filtered.filter((l) => l.source === 'facebook' || l.source === 'paid_social_other');
      } else if (funnelFilter.key === 'coldOutreach') {
        filtered = filtered.filter((l) => l.source === 'email_extension' || l.source === 'cold_outreach');
      }
      // 'totalLeads': no filter — show all contacts in period
    }
    // type === 'total' or 'metric' with no source sub-filter = all leads in period
    if (funnelFilter.row === 'deals') {
      filtered = filtered.filter((l) => {
        const lc = (l.lifecycleStage || '').toLowerCase();
        return l.numDeals > 0 || lc === 'opportunity' || lc === 'customer';
      });
    } else if (funnelFilter.row === 'won') {
      filtered = filtered.filter((l) => (l.lifecycleStage || '').toLowerCase() === 'customer');
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sources = [...new Set(activeLeads.map((l) => l.source))];
  const filterRepName = filterRep
    ? (isRepLeadsMode ? repLeads?.find((l) => l.repId === filterRep)?.rep : leads?.find((l) => l.repId === filterRep)?.rep)
    : null;

  const totalCount = leadsOmitted && leadCounts
    ? (leadCounts.qualified || 0) + (leadCounts.newLead || 0) + (leadCounts.manualEntry || 0) + (leadCounts.unqualified || 0) + (leadCounts.internal || 0)
    : (leads || []).length;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 space-y-4">
      {/* Status summary pills — only for narrow periods with full lead list */}
      {leadCounts && !isRepLeadsMode && (
        <div className="flex flex-wrap gap-3">
          {[
            { key: 'all', label: 'All Contacts', count: totalCount, color: 'bg-white/10 text-white/70' },
            { key: 'qualified', label: 'Qualified', count: leadCounts.qualified, color: 'bg-green-500/15 text-green-300' },
            { key: 'new_lead', label: 'New Leads', count: leadCounts.newLead, color: 'bg-blue-500/15 text-blue-300' },
            { key: 'manual_entry', label: 'Manual Entry', count: leadCounts.manualEntry, color: 'bg-amber-500/15 text-amber-300' },
            { key: 'unqualified', label: 'Unqualified', count: leadCounts.unqualified, color: 'bg-white/5 text-white/40' },
            { key: 'internal', label: 'Internal', count: leadCounts.internal, color: 'bg-red-500/15 text-red-300' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${s.color} ${
                statusFilter === s.key ? 'ring-2 ring-accent/50 scale-105' : 'hover:scale-105'
              }`}
            >
              {s.label} <span className="ml-1 font-bold">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {!showTable ? (
        <div className="text-center text-white/40 text-sm py-10">
          Contact list is not shown for monthly or longer periods.<br />
          Switch to <span className="text-white/60">Today</span> or <span className="text-white/60">This Week</span> to see individual contacts,<br />
          or click a rep in the leaderboard to see their contacts.
        </div>
      ) : repLeadsLoading && isRepLeadsMode ? (
        <div className="space-y-2 animate-pulse py-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Lead Details</h2>
              <span className="text-white/40 text-sm">{filtered.length} showing</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {funnelFilter && (
                <button
                  onClick={onClearFunnelFilter}
                  className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                >
                  {funnelFilter.type === 'metric' ? funnelFilter.label : `${funnelFilter.label} · ${funnelFilter.row}`} &times;
                </button>
              )}
              {filterRep && (
                <button
                  onClick={onClearFilter}
                  className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                >
                  {filterRepName} &times;
                </button>
              )}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white/80 focus:outline-none focus:border-accent/50"
              >
                <option value="all">All Sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase tracking-wider">
                  {[
                    { key: 'name', label: 'Name', align: 'left' },
                    { key: 'email', label: 'Email', align: 'left' },
                    { key: 'status', label: 'Status', align: 'left' },
                    { key: 'source', label: 'Source', align: 'left' },
                    { key: 'numDeals', label: 'Deals', align: 'center' },
                    { key: 'rep', label: 'Assigned To', align: 'left' },
                    { key: 'createdAt', label: 'Created', align: 'right' },
                    { key: 'hubspotUrl', label: '', align: 'center' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`pb-3 px-3 cursor-pointer hover:text-white/70 transition-colors ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
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
              <tbody>
                {sorted.map((lead) => (
                  <tr key={lead.id} className={`transition-colors border-t border-white/5 ${
                    lead.status === 'internal' ? 'opacity-40 hover:bg-white/5' :
                    (lead.source === 'facebook' && (!lead.repId || lead.rep === 'Unassigned'))
                      ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/40'
                      : lead.isReoptIn
                      ? 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/40'
                      : 'hover:bg-white/5'
                  }`}>
                    <td className="py-3 px-3 text-left font-medium">
                      {lead.name}
                      {lead.isReoptIn && (
                        <span
                          title={`Re-opted in (${lead.numConversionEvents} form fills) — first seen ${lead.createdAt?.substring(0, 10)}`}
                          className="ml-2 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-medium uppercase"
                        >
                          ↻ Re-opt
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-left text-white/60 text-xs">{lead.email}</td>
                    <td className="py-3 px-3 text-left">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[lead.status] || ''}`}>
                        {STATUS_LABELS[lead.status] || lead.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-left">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                        {SOURCE_LABELS[lead.source] || lead.source}
                      </span>
                      {lead.sourceDetail && lead.sourceDetail !== lead.sourceRaw && (
                        <span className="ml-2 text-white/30 text-xs">{lead.sourceDetail}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      {lead.numDeals > 0 ? (
                        <span className="text-green-400 font-medium">{lead.numDeals}</span>
                      ) : (
                        <span className="text-white/20">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-left text-white/80">{lead.rep}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-white/60 text-xs">
                      {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {lead.hubspotUrl && (
                        <a
                          href={lead.hubspotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/30 hover:text-accent transition-colors text-sm"
                          onClick={(e) => e.stopPropagation()}
                          title="Open in HubSpot"
                        >
                          ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
