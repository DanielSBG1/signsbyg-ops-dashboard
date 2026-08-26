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

function fmtPct(val) {
  if (val == null) return '0%';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `${num.toFixed(2)}%`;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-widest mb-3">
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums leading-none text-gray-900">
        {value ?? '---'}
      </p>
      {sub && (
        <p className="text-gray-500 text-xs mt-2">{sub}</p>
      )}
    </div>
  );
}

// ─── P&L Table ──────────────────────────────────────────────────────────────

function PnlTable({ monthlyPnl }) {
  if (!monthlyPnl || monthlyPnl.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No monthly P&L data available.
      </div>
    );
  }

  const totals = monthlyPnl.reduce(
    (acc, row) => ({
      metaSpend: acc.metaSpend + (row.metaSpend ?? 0),
      boostedSpend: acc.boostedSpend + (row.boostedSpend ?? 0),
      hubspotLeads: acc.hubspotLeads + (row.hubspotLeads ?? 0),
      revenue: acc.revenue + (row.revenue ?? 0),
      deals: acc.deals + (row.deals ?? 0),
    }),
    { metaSpend: 0, boostedSpend: 0, hubspotLeads: 0, revenue: 0, deals: 0 },
  );
  totals.contribution = totals.revenue - totals.metaSpend - totals.boostedSpend;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Monthly P&L
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Month
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Meta Spend
              </th>
              <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                Boosted
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
                Contribution
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {monthlyPnl.map((row, i) => {
              const totalSpend = (row.metaSpend ?? 0) + (row.boostedSpend ?? 0);
              const contribution = (row.revenue ?? 0) - totalSpend;
              return (
                <tr key={i} className="hover:bg-black/[0.02] transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{row.month}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {fmtMoney(row.metaSpend)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {fmtMoney(row.boostedSpend)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {fmtNum(row.hubspotLeads)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900 font-medium">
                    {fmtMoney(row.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {fmtNum(row.deals)}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${
                    contribution >= 0 ? 'text-success' : 'text-danger'
                  }`}>
                    {contribution >= 0 ? '+' : ''}{fmtMoney(contribution)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-5 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                {fmtMoney(totals.metaSpend)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                {fmtMoney(totals.boostedSpend)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                {fmtNum(totals.hubspotLeads)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                {fmtMoney(totals.revenue)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                {fmtNum(totals.deals)}
              </td>
              <td className={`px-5 py-3 text-right tabular-nums ${
                totals.contribution >= 0 ? 'text-success' : 'text-danger'
              }`}>
                {totals.contribution >= 0 ? '+' : ''}{fmtMoney(totals.contribution)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function MetaAdsOverview({ data }) {
  const summary = data.summary ?? {};

  return (
    <div className="space-y-6">
      {/* Headline KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <KpiCard
          label="Total Spend"
          value={fmtMoney(summary.totalSpend)}
          sub="Meta + boosted"
        />
        <KpiCard
          label="Meta Leads"
          value={fmtNum(summary.metaLeads)}
          sub="on-platform leads"
        />
        <KpiCard
          label="Cost / Lead"
          value={fmtMoneyExact(summary.costPerLead)}
          sub="Meta spend / leads"
        />
        <KpiCard
          label="HubSpot Leads"
          value={fmtNum(summary.hubspotLeads)}
          sub="attributed contacts"
        />
        <KpiCard
          label="Attributed Revenue"
          value={fmtMoney(summary.attributedRevenue)}
          sub="closed-won deals"
        />
        <KpiCard
          label="Deals Won"
          value={fmtNum(summary.dealsWon)}
          sub="closed in period"
        />
        <KpiCard
          label="Link CTR"
          value={fmtPct(summary.linkCtr)}
          sub="click-through rate"
        />
      </div>

      {/* Monthly P&L table */}
      <PnlTable monthlyPnl={data.monthlyPnl ?? []} />
    </div>
  );
}
