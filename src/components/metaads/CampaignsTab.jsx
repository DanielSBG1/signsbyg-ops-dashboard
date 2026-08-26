import React from 'react';

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

function roasColor(roas) {
  if (roas == null) return 'text-gray-500';
  if (roas >= 3) return 'text-success';
  if (roas >= 1) return 'text-warning';
  return 'text-danger';
}

function fmtRoas(val) {
  if (val == null || Number.isNaN(val)) return '---';
  return `${val.toFixed(1)}x`;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CampaignsTab({ campaigns }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No campaign data available for this period.
      </div>
    );
  }

  const sorted = [...campaigns].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Campaigns by Spend
        </p>
        <p className="text-xs text-gray-500">
          {sorted.length} campaign{sorted.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Campaign
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Spend
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Meta Leads
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Cost/Lead
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                HS Leads
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Revenue
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Deals
              </th>
              <th className="text-right px-5 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                ROAS
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((c, i) => {
              const spend = c.spend ?? 0;
              const metaLeads = c.metaLeads ?? 0;
              const cpl = metaLeads > 0 ? spend / metaLeads : null;
              const revenue = c.revenue ?? 0;
              const roas = spend > 0 ? revenue / spend : null;

              return (
                <tr key={c.id ?? i} className="hover:bg-black/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900 truncate max-w-[320px]" title={c.name}>
                      {c.name}
                    </p>
                    {c.status && (
                      <span className={`text-[10px] font-semibold uppercase ${
                        c.status === 'ACTIVE' ? 'text-success' : 'text-gray-500'
                      }`}>
                        {c.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-900 font-medium">
                    {fmtMoney(spend)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">
                    {fmtNum(metaLeads)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">
                    {cpl != null ? fmtMoneyExact(cpl) : '---'}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">
                    {fmtNum(c.hubspotLeads)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-900 font-medium">
                    {fmtMoney(revenue)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">
                    {fmtNum(c.deals)}
                  </td>
                  <td className={`px-5 py-3.5 text-right tabular-nums font-bold ${roasColor(roas)}`}>
                    {fmtRoas(roas)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
