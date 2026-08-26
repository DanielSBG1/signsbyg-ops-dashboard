import React, { useMemo, useState } from 'react';

// ---- Formatting helpers ---------------------------------------------------

function fmtMoney(val, decimals = 0) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtNum(val) {
  if (val == null) return '0';
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

function fmtPct(val) {
  if (val == null || Number.isNaN(val)) return '---';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `${num.toFixed(2)}%`;
}

function safeRatio(num, denom) {
  if (!denom || denom === 0) return null;
  return num / denom;
}

// ---- Lead Efficiency scoring (mirrors standalone scoreEfficiency) ----------

const GOAL_LABELS = {
  LEAD_GENERATION: 'Lead Gen',
  OUTCOME_LEADS: 'Lead Gen',
  LANDING_PAGE_VIEWS: 'Traffic',
  CONVERSATIONS: 'Messaging',
  LINK_CLICKS: 'Link Clicks',
};

function scoreEfficiency(spend, leads, impressions, linkClicks) {
  // CPL-based scoring: lower CPL = better score
  // Returns a numeric score (0-100) and a tier
  if (!spend || spend === 0) return { score: null, tier: 'none' };
  if (!leads || leads === 0) {
    // No leads: check if it has clicks at least
    if (linkClicks > 0) return { score: 15, tier: 'poor' };
    return { score: 0, tier: 'none' };
  }
  const cpl = spend / leads;
  // Tier thresholds based on typical sign industry CPL
  if (cpl <= 15) return { score: 95, tier: 'excellent' };
  if (cpl <= 30) return { score: 80, tier: 'good' };
  if (cpl <= 50) return { score: 60, tier: 'fair' };
  if (cpl <= 80) return { score: 40, tier: 'poor' };
  return { score: 20, tier: 'bad' };
}

const EFFICIENCY_COLORS = {
  excellent: 'bg-success',
  good: 'bg-emerald-400',
  fair: 'bg-warning',
  poor: 'bg-orange-400',
  bad: 'bg-danger',
  none: 'bg-gray-300',
};

const EFFICIENCY_TEXT = {
  excellent: 'text-success',
  good: 'text-emerald-500',
  fair: 'text-warning',
  poor: 'text-orange-500',
  bad: 'text-danger',
  none: 'text-gray-400',
};

function EfficiencyDot({ tier }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${EFFICIENCY_COLORS[tier] ?? EFFICIENCY_COLORS.none}`}
      title={`Lead Efficiency: ${tier}`}
    />
  );
}

function EfficiencyLegend() {
  const items = [
    { tier: 'excellent', label: 'Excellent' },
    { tier: 'good', label: 'Good' },
    { tier: 'fair', label: 'Fair' },
    { tier: 'poor', label: 'Poor' },
    { tier: 'bad', label: 'Bad' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
      <span className="font-semibold uppercase tracking-widest">Lead Efficiency:</span>
      {items.map(i => (
        <span key={i.tier} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${EFFICIENCY_COLORS[i.tier]}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ---- Audience classification (matches standalone) -------------------------

const AUDIENCE_GROUPS = [
  { id: 'open', label: 'Open / Broad', gradient: 'linear-gradient(90deg,#34d399,#059669)' },
  { id: 'retargeting', label: 'Retargeting / Lookalike', gradient: 'linear-gradient(90deg,#fbbf24,#f59e0b)' },
  { id: 'targeted', label: 'Targeted Audiences', gradient: 'linear-gradient(90deg,#818cf8,#6366f1)' },
];

function classifyAudience(name) {
  const lower = (name ?? '').toLowerCase();
  if (lower === 'open' || lower.startsWith('open-') || lower === 'broad' || lower === 'broad_test' || lower === 'instantforms')
    return 'open';
  if (lower.includes('retarget') || lower.includes('lookalike') || lower.includes('engaged'))
    return 'retargeting';
  return 'targeted';
}

// ---- Expandable Ad Row (ads within an ad set) -----------------------------

function AdRow({ ad }) {
  const cpl = safeRatio(ad.spend, ad.metaLeads);
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-black/[0.02] transition-colors bg-gray-50/50">
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2 pl-8">
        <div className="flex items-center gap-2">
          {ad.thumbnailUrl ? (
            <img
              src={ad.thumbnailUrl}
              alt={ad.name}
              className="h-7 w-7 rounded object-cover bg-gray-100 shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="h-7 w-7 rounded bg-gray-100 flex items-center justify-center text-gray-300 text-[10px] shrink-0">
              &#9654;
            </div>
          )}
          <span className="text-gray-600 text-xs truncate max-w-[200px]" title={ad.name}>
            {ad.name}
          </span>
        </div>
      </td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-500">{fmtMoney(ad.spend)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-500">{fmtNum(ad.metaLeads)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">
        {cpl != null ? fmtMoney(cpl, 2) : '---'}
      </td>
      <td className="px-3 py-2 text-right text-xs text-gray-300">---</td>
      <td className="px-3 py-2 text-right text-xs text-gray-300">---</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">{fmtNum(ad.linkClicks)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">
        {ad.impressions > 0 ? fmtPct((ad.linkClicks / ad.impressions) * 100) : '---'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">
        {ad.linkClicks > 0 ? fmtMoney(ad.spend / ad.linkClicks, 2) : '---'}
      </td>
    </tr>
  );
}

// ---- Group Section (one audience group) -----------------------------------

function GroupSection({ group, adSets, adsByAdSet, adSetRevenueMap, metaLeadCountsByAdSet }) {
  const [expandedAdSets, setExpandedAdSets] = useState(new Set());

  const groupSpend = adSets.reduce((s, a) => s + (a.spend ?? 0), 0);
  const groupLeads = adSets.reduce((s, a) => s + (a.metaLeads ?? 0), 0);
  const groupRev = adSets.reduce((s, a) => s + (adSetRevenueMap[a.adSetId]?.revenue ?? 0), 0);

  const toggleExpand = (id) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="h-1.5 w-6 rounded-full" style={{ background: group.gradient }} />
        <span className="text-sm font-bold text-gray-900">{group.label}</span>
        <span className="text-xs text-gray-400">
          {adSets.length} ad set{adSets.length !== 1 ? 's' : ''} &middot; {fmtMoney(groupSpend)} spend &middot; {fmtNum(groupLeads)} leads
          {groupRev > 0 ? ` \u00b7 ${fmtMoney(groupRev)} revenue` : ''}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500 w-10">#</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500 w-10">LE</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Ad Set / Audience</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Campaign</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Spend</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Meta Leads</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Cost / Lead</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">HubSpot Leads</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Revenue</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Link Clicks</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">CTR</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">CPC</th>
              </tr>
            </thead>
            <tbody>
              {adSets.map((s, idx) => {
                const cpl = safeRatio(s.spend, s.metaLeads);
                const ctr = safeRatio(s.linkClicks, s.impressions);
                const cpc = safeRatio(s.spend, s.linkClicks);
                const eff = scoreEfficiency(s.spend, s.metaLeads, s.impressions, s.linkClicks);
                const rev = adSetRevenueMap[s.adSetId];
                const hsLeads = metaLeadCountsByAdSet[s.adSetId];
                const innerAds = adsByAdSet[s.adSetId] ?? [];
                const isExpanded = expandedAdSets.has(s.adSetId);

                return (
                  <React.Fragment key={s.adSetId}>
                    <tr
                      className={`border-b border-gray-100 transition-colors hover:bg-black/[0.02] ${
                        innerAds.length > 0 ? 'cursor-pointer' : ''
                      }`}
                      onClick={innerAds.length > 0 ? () => toggleExpand(s.adSetId) : undefined}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          idx === 0 ? 'bg-success/20 text-success' : idx === 1 ? 'bg-purple-100 text-purple-600' : 'text-gray-400'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <EfficiencyDot tier={eff.tier} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {innerAds.length > 0 && (
                            <span className="text-gray-400 text-[10px] shrink-0 w-3 text-center">
                              {isExpanded ? '\u25BC' : '\u25B6'}
                            </span>
                          )}
                          <span className="font-bold text-gray-900">{s.name}</span>
                          {s.optimizationGoal && (
                            <span className="ml-1 whitespace-nowrap rounded-full bg-purple-50 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-purple-600">
                              {GOAL_LABELS[s.optimizationGoal] ?? s.optimizationGoal}
                            </span>
                          )}
                          {innerAds.length > 0 && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              {innerAds.length} ad{innerAds.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 truncate max-w-[180px]" title={s.campaignName}>
                        {s.campaignName ?? '---'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-purple-600">
                        {fmtMoney(s.spend)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-success">
                        {fmtNum(s.metaLeads)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-extrabold ${cpl != null ? 'text-gray-900' : 'text-gray-400'}`}>
                        {cpl != null ? fmtMoney(cpl, 2) : '---'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {hsLeads != null ? (
                          <span className="tabular-nums font-extrabold text-indigo-500">{fmtNum(hsLeads)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs" title="Not yet measured at ad set level">n/a</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {rev ? (
                          <span className="tabular-nums font-extrabold text-success">{fmtMoney(rev.revenue)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs" title="Revenue not yet measured at ad set level">n/a</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmtNum(s.linkClicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                        {ctr != null ? fmtPct(ctr * 100) : '---'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                        {cpc != null ? fmtMoney(cpc, 2) : '---'}
                      </td>
                    </tr>

                    {/* Expanded individual ads */}
                    {isExpanded && innerAds.map(ad => (
                      <AdRow key={ad.adId} ad={ad} />
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Main component -------------------------------------------------------

export default function AdSetsTab({ data }) {
  const adSets = data?.adSets ?? [];
  const ads = data?.ads ?? [];
  const adSetRevenue = data?.adSetRevenue ?? [];
  const metaLeadCounts = data?.metaLeadCounts ?? { byAdSet: {}, byAd: {} };

  // Build lookup maps
  const adSetRevenueMap = useMemo(() => {
    const m = {};
    for (const r of adSetRevenue) m[r.adSetId] = r;
    return m;
  }, [adSetRevenue]);

  const adsByAdSet = useMemo(() => {
    const m = {};
    for (const a of ads) {
      if (!m[a.adSetId]) m[a.adSetId] = [];
      m[a.adSetId].push(a);
    }
    return m;
  }, [ads]);

  const metaLeadCountsByAdSet = useMemo(() => {
    return metaLeadCounts.byAdSet ?? {};
  }, [metaLeadCounts]);

  // Group ad sets by audience type, sorted by leads desc then revenue desc
  const groupedAdSets = useMemo(() => {
    const groups = {};
    for (const s of adSets) {
      const g = classifyAudience(s.name);
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }
    // Sort within each group by metaLeads desc, then revenue desc
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const leadsA = a.metaLeads ?? 0;
        const leadsB = b.metaLeads ?? 0;
        if (leadsB !== leadsA) return leadsB - leadsA;
        const revA = adSetRevenueMap[a.adSetId]?.revenue ?? 0;
        const revB = adSetRevenueMap[b.adSetId]?.revenue ?? 0;
        return revB - revA;
      });
    }
    return groups;
  }, [adSets, adSetRevenueMap]);

  if (adSets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No ad sets delivered in this period.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900">Ad Set Performance &mdash; By Audience Group</h2>
      </div>

      <div className="mb-3">
        <EfficiencyLegend />
      </div>

      <div className="space-y-6">
        {AUDIENCE_GROUPS.map(group => {
          const items = groupedAdSets[group.id];
          if (!items || items.length === 0) return null;
          return (
            <GroupSection
              key={group.id}
              group={group}
              adSets={items}
              adsByAdSet={adsByAdSet}
              adSetRevenueMap={adSetRevenueMap}
              metaLeadCountsByAdSet={metaLeadCountsByAdSet}
            />
          );
        })}
      </div>
    </div>
  );
}
