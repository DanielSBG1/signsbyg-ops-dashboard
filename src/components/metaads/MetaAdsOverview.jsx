import React, { useState } from 'react';
import DealsDrawer from './DealsDrawer';

// ---- Formatting helpers ---------------------------------------------------

function fmtMoney(val, decimals = 0) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtMoneyCompact(val) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 10_000) return `$${(num / 1_000).toFixed(1)}k`;
  return fmtMoney(num);
}

function fmtNum(val) {
  if (val == null) return '0';
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

function fmtPct(val, decimals = 2) {
  if (val == null || Number.isNaN(val)) return '---';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `${num.toFixed(decimals)}%`;
}

function safeRatio(num, denom) {
  if (!denom || denom === 0) return null;
  return num / denom;
}

function monthLabel(ym) {
  if (!ym) return '---';
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ---- Metric tile (matches standalone MetricTile) --------------------------

const TOPBAR_COLORS = [
  'linear-gradient(90deg,#e879f9,#a855f7)',  // spend
  'linear-gradient(90deg,#34d399,#059669)',  // meta leads
  'linear-gradient(90deg,#fbbf24,#f59e0b)',  // cpl
  'linear-gradient(90deg,#818cf8,#6366f1)',  // hubspot leads
  'linear-gradient(90deg,#34d399,#0d9488)',  // revenue
  null,                                       // link clicks
  null,                                       // link ctr
  null,                                       // cpc
];

function MetricTile({ label, value, sub, topbar, muted, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-2xl overflow-hidden text-left w-full ${onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all' : ''}`}
    >
      {topbar && (
        <div className="h-1" style={{ background: topbar }} />
      )}
      <div className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
          {label}
        </p>
        <p className={`text-2xl font-bold tabular-nums leading-none ${muted ? 'text-gray-400' : 'text-gray-900'}`}>
          {value ?? '---'}
        </p>
        {sub && (
          <p className="text-gray-500 text-xs mt-2">{sub}</p>
        )}
      </div>
    </Wrapper>
  );
}

// ---- P&L Table (matches standalone Monthly P&L) ---------------------------

function PnlTable({ monthlyPnl }) {
  if (!monthlyPnl || monthlyPnl.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No monthly P&L data available.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-900">Monthly P&L</h2>
        <span className="text-[10px] text-gray-400">All months &middot; independent of the period filter above</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Month</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Meta Spend</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Boosted Spend</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Total Marketing</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">HubSpot Leads</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Closed-Won Revenue</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Deals</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-500">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {monthlyPnl.map((row) => {
                const totalSpend = (row.metaSpend ?? 0) + (row.boostedSpend ?? 0);
                const contribution = (row.revenue ?? 0) - totalSpend;

                return (
                  <tr key={row.month} className="border-b border-gray-100 last:border-0 hover:bg-black/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-bold text-gray-900">{monthLabel(row.month)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-extrabold text-purple-600">
                      {fmtMoney(row.metaSpend)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-indigo-500">
                      {fmtMoney(row.boostedSpend)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-extrabold text-gray-900">
                      {fmtMoney(totalSpend)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {fmtNum(row.hubspotLeads)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-extrabold text-success">
                      {fmtMoney(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {fmtNum(row.deals)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-extrabold ${
                      contribution >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                      {fmtMoney(contribution)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-gray-100 px-4 py-2.5 text-[11px] leading-relaxed text-gray-400">
          Spend is booked when delivered; revenue when its deal closed. Deals here close months
          after the lead arrives, so a month's contribution is the margin on what closed,
          not a return on that month's spend.
        </p>
      </div>
    </div>
  );
}

// ---- Main component -------------------------------------------------------

export default function MetaAdsOverview({ data }) {
  const totals = data.totals ?? {};
  const adSets = data.adSets ?? [];
  const ads = data.ads ?? [];

  const totalCpl = safeRatio(totals.spend, totals.metaLeads);
  const linkCtr = totals.linkCtr;
  const cpc = safeRatio(totals.spend, totals.linkClicks);
  const cpm = safeRatio(totals.spend * 1000, totals.impressions);

  // Derive hubspot leads and revenue from campaigns
  const campaigns = data.campaigns ?? [];
  const totalHubspotLeads = campaigns.reduce((s, c) => s + (c.hubspotLeads ?? 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue ?? 0), 0);

  const [showDeals, setShowDeals] = useState(false);
  const preset = data?.period?.preset ?? 'year';

  return (
    <div className="space-y-8">
      {/* Deals drawer */}
      {showDeals && (
        <DealsDrawer preset={preset} onClose={() => setShowDeals(false)} />
      )}

      {/* ---- 8 headline metric tiles ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8">
        <MetricTile
          label="Meta Spend"
          value={fmtMoney(totals.spend)}
          topbar={TOPBAR_COLORS[0]}
          sub={`${fmtNum(ads.length)} ads \u00b7 ${adSets.length} ad sets`}
        />
        <MetricTile
          label="Meta Leads"
          value={fmtNum(totals.metaLeads)}
          topbar={TOPBAR_COLORS[1]}
          sub="Reported by Meta"
        />
        <MetricTile
          label="Cost / Meta Lead"
          value={totalCpl != null ? fmtMoney(totalCpl, 2) : '---'}
          topbar={TOPBAR_COLORS[2]}
          muted={totalCpl == null}
        />
        <MetricTile
          label="HubSpot Leads"
          value={fmtNum(totalHubspotLeads)}
          topbar={TOPBAR_COLORS[3]}
          sub="Campaign-identified"
        />
        <MetricTile
          label="Attributed Revenue"
          value={fmtMoney(totalRevenue)}
          topbar={TOPBAR_COLORS[4]}
          sub="Click to see deals →"
          onClick={() => setShowDeals(true)}
        />
        <MetricTile
          label="Meta Link Clicks"
          value={fmtNum(totals.linkClicks)}
          sub={totals.impressions > 0 ? `${fmtNum(totals.impressions)} impressions` : undefined}
        />
        <MetricTile
          label="Link CTR"
          value={linkCtr != null ? fmtPct(linkCtr) : '---'}
          muted={linkCtr == null}
        />
        <MetricTile
          label="Cost / Link Click"
          value={cpc != null ? fmtMoney(cpc, 2) : '---'}
          muted={cpc == null}
          sub={cpm != null ? `${fmtMoney(cpm, 2)} CPM` : undefined}
        />
      </div>

      {/* ---- Monthly P&L table ---- */}
      <PnlTable monthlyPnl={data.monthlyPnl ?? []} />
    </div>
  );
}
