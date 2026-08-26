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

// ---- Lead Efficiency scoring (same logic as AdSetsTab) --------------------

function scoreEfficiency(spend, leads) {
  if (!spend || spend === 0) return { score: null, tier: 'none' };
  if (!leads || leads === 0) return { score: 15, tier: 'poor' };
  const cpl = spend / leads;
  if (cpl <= 15) return { tier: 'excellent' };
  if (cpl <= 30) return { tier: 'good' };
  if (cpl <= 50) return { tier: 'fair' };
  if (cpl <= 80) return { tier: 'poor' };
  return { tier: 'bad' };
}

const EFFICIENCY_COLORS = {
  excellent: 'bg-success',
  good: 'bg-emerald-400',
  fair: 'bg-warning',
  poor: 'bg-orange-400',
  bad: 'bg-danger',
  none: 'bg-gray-300',
};

function EfficiencyDot({ tier }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${EFFICIENCY_COLORS[tier] ?? EFFICIENCY_COLORS.none}`}
      title={`Lead Efficiency: ${tier}`}
    />
  );
}

// ---- Sort options ---------------------------------------------------------

const SORT_OPTIONS = [
  { key: 'spend', label: 'Spend', get: (c) => c.spend },
  { key: 'revenue', label: 'Revenue', get: (c) => c.revenue },
  { key: 'hubspotLeads', label: 'HubSpot Leads', get: (c) => c.hubspotLeads },
  { key: 'leads', label: 'Meta Leads', get: (c) => c.metaLeads },
  { key: 'efficiency', label: 'Lead Efficiency', get: (c) => {
    const eff = scoreEfficiency(c.spend, c.metaLeads);
    return eff.tier === 'none' ? -1 : (eff.score ?? 0);
  }},
];

// ---- Main component -------------------------------------------------------

export default function CampaignsTab({ data }) {
  const campaigns = data?.campaigns ?? [];
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const opt = SORT_OPTIONS.find(o => o.key === sortKey) ?? SORT_OPTIONS[0];
    return [...campaigns].sort((a, b) => {
      const av = opt.get(a) ?? 0;
      const bv = opt.get(b) ?? 0;
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [campaigns, sortKey, sortDir]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No campaigns delivered in this period.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900">Campaign Performance &mdash; Strategy</h2>
        <div className="flex gap-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                sortKey === opt.key
                  ? 'bg-black/[0.06] text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {opt.label}
              {sortKey === opt.key && (
                <span className="ml-0.5">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500 w-10">LE</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Campaign</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Spend</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Meta Leads</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Cost / Lead</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">HubSpot Leads</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Revenue</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Ad Sets</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Ads</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const cpl = c.metaLeads > 0 ? c.spend / c.metaLeads : null;
                const eff = scoreEfficiency(c.spend, c.metaLeads);

                // Count ad sets and ads for this campaign from the full data
                const allAdSets = data?.adSets ?? [];
                const allAds = data?.ads ?? [];
                const campaignAdSets = allAdSets.filter(s => s.campaignName === c.name);
                const campaignAds = allAds.filter(a => a.campaignName === c.name);

                return (
                  <tr key={c.campaignId} className="border-b border-gray-100 last:border-0 hover:bg-black/[0.02] transition-colors">
                    <td className="px-3 py-2.5 text-center">
                      <EfficiencyDot tier={eff.tier} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-gray-900">{c.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-purple-600">
                      {fmtMoney(c.spend)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-success">
                      {fmtNum(c.metaLeads)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-extrabold ${cpl != null ? 'text-gray-900' : 'text-gray-400'}`}>
                      {cpl != null ? fmtMoney(cpl, 2) : '---'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {c.hubspotLeads > 0 ? (
                        <span className="tabular-nums font-extrabold text-indigo-500">{fmtNum(c.hubspotLeads)}</span>
                      ) : (
                        <span className="text-gray-300 text-xs" title="No HubSpot contacts in this period carry this campaign's identity.">---</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {c.revenue > 0 ? (
                        <span className="tabular-nums font-extrabold text-success">{fmtMoney(c.revenue)}</span>
                      ) : (
                        <span className="text-gray-300 text-xs" title="No closed-won deal has been attributed to this campaign yet.">---</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {campaignAdSets.length}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {campaignAds.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
