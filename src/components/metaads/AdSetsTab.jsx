import React, { useMemo, useState } from 'react';

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmtMoney(val) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 10_000) return `$${(num / 1_000).toFixed(1)}k`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMoneyExact(val) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(val) {
  if (val == null) return '0';
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  return num.toLocaleString('en-US');
}

function fmtPct(val) {
  if (val == null) return '0%';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `${num.toFixed(2)}%`;
}

// ─── Classification logic ───────────────────────────────────────────────────

const AUDIENCE_GROUPS = [
  {
    id: 'open',
    label: 'Open / Broad',
    color: '#06d6a0',
    bgClass: 'bg-success/20',
    textClass: 'text-success',
    match: (name) => {
      const lower = name.toLowerCase();
      return lower.includes('open') || lower.includes('broad') || lower.includes('instantforms');
    },
  },
  {
    id: 'retargeting',
    label: 'Retargeting / Lookalike',
    color: '#FCB016',
    bgClass: 'bg-accent/20',
    textClass: 'text-accent',
    match: (name) => {
      const lower = name.toLowerCase();
      return lower.includes('retarget') || lower.includes('lookalike') || lower.includes('engaged');
    },
  },
  {
    id: 'targeted',
    label: 'Targeted',
    color: '#06b6d4',
    bgClass: 'bg-cyan-400/20',
    textClass: 'text-cyan-400',
    match: () => true, // fallback
  },
];

function classifyAdSet(name) {
  for (const group of AUDIENCE_GROUPS) {
    if (group.id === 'targeted') continue; // skip fallback during matching
    if (group.match(name)) return group.id;
  }
  return 'targeted';
}

function computeGroupTotals(adSets) {
  return adSets.reduce(
    (acc, a) => ({
      spend: acc.spend + (a.spend ?? 0),
      metaLeads: acc.metaLeads + (a.metaLeads ?? 0),
      linkClicks: acc.linkClicks + (a.linkClicks ?? 0),
    }),
    { spend: 0, metaLeads: 0, linkClicks: 0 },
  );
}

// ─── Group Section ──────────────────────────────────────────────────────────

function GroupSection({ group, adSets }) {
  const [collapsed, setCollapsed] = useState(false);
  const totals = useMemo(() => computeGroupTotals(adSets), [adSets]);
  const cpl = totals.metaLeads > 0 ? totals.spend / totals.metaLeads : null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full text-left px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: group.color }}
          />
          <p className="text-sm font-semibold text-gray-900">{group.label}</p>
          <span className="text-xs text-gray-500">
            {adSets.length} ad set{adSets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-5 text-xs tabular-nums">
          <span className="text-gray-500">
            Spend: <span className="text-gray-900 font-medium">{fmtMoney(totals.spend)}</span>
          </span>
          <span className="text-gray-500">
            Leads: <span className="text-gray-900 font-medium">{fmtNum(totals.metaLeads)}</span>
          </span>
          <span className="text-gray-500">
            CPL: <span className="text-gray-900 font-medium">{cpl != null ? fmtMoneyExact(cpl) : '---'}</span>
          </span>
          <span className="text-gray-500 text-[10px]">{collapsed ? '+ expand' : '- collapse'}</span>
        </div>
      </button>

      {/* Table */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-center px-3 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest w-10">
                  #
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Ad Set
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Campaign
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Spend
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Meta Leads
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Cost/Lead
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  Link Clicks
                </th>
                <th className="text-right px-5 py-2.5 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                  CTR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adSets.map((a, idx) => {
                const spend = a.spend ?? 0;
                const metaLeads = a.metaLeads ?? 0;
                const adCpl = metaLeads > 0 ? spend / metaLeads : null;

                return (
                  <tr key={a.id ?? idx} className="hover:bg-black/[0.02] transition-colors">
                    <td className="px-3 py-3 text-center tabular-nums text-gray-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[260px]" title={a.name}>
                        {a.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-500 truncate max-w-[200px]" title={a.campaignName}>
                        {a.campaignName ?? '---'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900 font-medium">
                      {fmtMoney(spend)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                      {fmtNum(metaLeads)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                      {adCpl != null ? fmtMoneyExact(adCpl) : '---'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                      {fmtNum(a.linkClicks)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                      {fmtPct(a.ctr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function AdSetsTab({ adSets }) {
  const grouped = useMemo(() => {
    const buckets = { open: [], retargeting: [], targeted: [] };

    for (const adSet of adSets) {
      const groupId = classifyAdSet(adSet.name ?? '');
      buckets[groupId].push(adSet);
    }

    // Sort within each group by metaLeads descending
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => (b.metaLeads ?? 0) - (a.metaLeads ?? 0));
    }

    return buckets;
  }, [adSets]);

  if (!adSets || adSets.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No ad set data available for this period.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {AUDIENCE_GROUPS.map(group => {
        const items = grouped[group.id] ?? [];
        if (items.length === 0) return null;
        return (
          <GroupSection key={group.id} group={group} adSets={items} />
        );
      })}
    </div>
  );
}
