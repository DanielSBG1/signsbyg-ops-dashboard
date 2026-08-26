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

function safeRatio(num, denom) {
  if (!denom || denom === 0) return null;
  return num / denom;
}

// ---- Efficiency scoring ---------------------------------------------------

function scoreEfficiency(spend, leads) {
  if (!spend || spend === 0) return { tier: 'none' };
  if (!leads || leads === 0) return { tier: 'poor' };
  const cpl = spend / leads;
  if (cpl <= 15) return { tier: 'excellent' };
  if (cpl <= 30) return { tier: 'good' };
  if (cpl <= 50) return { tier: 'fair' };
  if (cpl <= 80) return { tier: 'poor' };
  return { tier: 'bad' };
}

const BADGE_STYLES = {
  excellent: 'bg-success/20 text-success',
  good: 'bg-emerald-100 text-emerald-600',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-orange-100 text-orange-600',
  bad: 'bg-danger/20 text-danger',
  none: 'bg-gray-100 text-gray-400',
};

function EfficiencyBadge({ tier }) {
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider ${BADGE_STYLES[tier] ?? BADGE_STYLES.none}`}>
      {tier}
    </span>
  );
}

// ---- Sort options ---------------------------------------------------------

const SORT_OPTIONS = [
  { key: 'efficiency', label: 'Lead Efficiency' },
  { key: 'spend', label: 'Spend' },
  { key: 'leads', label: 'Meta Leads' },
  { key: 'cpl', label: 'Cost / Lead' },
];

// ---- Creative card (matches standalone) -----------------------------------

function CreativeCard({ creative, revenue }) {
  const cpl = safeRatio(creative.spend, creative.metaLeads);
  const eff = scoreEfficiency(creative.spend, creative.metaLeads);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
      {/* Thumbnail */}
      {creative.thumbnailUrl ? (
        <img
          src={creative.thumbnailUrl}
          alt={`Creative preview: ${creative.creativeSlug}`}
          loading="lazy"
          className="aspect-video w-full bg-gray-100 object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-purple-50 text-purple-200 text-3xl">
          &#9654;
        </div>
      )}

      {/* Card body */}
      <div className="p-4">
        {/* Title + efficiency badge */}
        <div className="flex items-start justify-between gap-1.5 mb-1">
          <p className="font-bold text-gray-900 truncate text-sm" title={creative.creativeSlug}>
            {creative.creativeSlug}
          </p>
          <EfficiencyBadge tier={eff.tier} />
        </div>

        {/* Ad count */}
        <p className="text-[11px] text-gray-400 mb-3">
          {creative.adCount} ad{creative.adCount !== 1 ? 's' : ''} across audiences
        </p>

        {/* Metrics grid */}
        <div className="grid grid-cols-4 gap-2 border-t border-gray-100 pt-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Spent</p>
            <p className="text-sm tabular-nums font-extrabold text-purple-600">{fmtMoney(creative.spend)}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Leads</p>
            <p className="text-sm tabular-nums font-extrabold text-success">{fmtNum(creative.metaLeads)}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">CPL</p>
            <p className={`text-sm tabular-nums font-extrabold ${cpl != null ? 'text-gray-900' : 'text-gray-400'}`}>
              {cpl != null ? fmtMoney(cpl) : '---'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Revenue</p>
            {revenue != null ? (
              <p className="text-sm tabular-nums font-extrabold text-success">{fmtMoney(revenue)}</p>
            ) : (
              <p className="text-sm tabular-nums font-extrabold text-gray-300" title="Revenue not yet measured at creative level">n/a</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main component -------------------------------------------------------

export default function CreativesSection({ data }) {
  const creatives = data?.creatives ?? [];
  const creativeRevenue = data?.creativeRevenue ?? [];
  const [sortKey, setSortKey] = useState('efficiency');
  const [sortDir, setSortDir] = useState('desc');
  const [collapsed, setCollapsed] = useState(false);

  // Build revenue lookup
  const revenueBySlug = useMemo(() => {
    const m = {};
    for (const r of creativeRevenue) m[r.creativeSlug] = r.revenue;
    return m;
  }, [creativeRevenue]);

  // Sort creatives
  const sorted = useMemo(() => {
    const accessors = {
      efficiency: (c) => {
        const eff = scoreEfficiency(c.spend, c.metaLeads);
        return eff.tier === 'none' ? -1 : (
          eff.tier === 'excellent' ? 95 :
          eff.tier === 'good' ? 80 :
          eff.tier === 'fair' ? 60 :
          eff.tier === 'poor' ? 40 : 20
        );
      },
      spend: (c) => c.spend ?? 0,
      leads: (c) => c.metaLeads ?? 0,
      cpl: (c) => {
        const cpl = safeRatio(c.spend, c.metaLeads);
        return cpl != null ? cpl : Infinity;
      },
    };
    const get = accessors[sortKey] ?? accessors.efficiency;

    return [...creatives].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      // For CPL, ascending is "better"
      if (sortKey === 'cpl') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [creatives, sortKey, sortDir]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (creatives.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No creatives found in this period following the v## naming convention.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="flex items-center gap-2"
          >
            <span className="text-gray-400 text-xs">{collapsed ? '\u25B6' : '\u25BC'}</span>
            <h2 className="text-sm font-bold text-gray-900">Performance per Video</h2>
          </button>
          <details className="inline-block text-xs">
            <summary className="cursor-pointer font-bold text-purple-600">What is this?</summary>
            <p className="absolute z-10 mt-1.5 max-w-[46ch] rounded-xl border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-500 shadow-lg">
              Creative Performance evaluates the effectiveness of the actual message or video across
              the audiences where it runs. Campaign shows strategy, Ad Set shows audience, and
              Creative shows which message is worth making more of. One creative runs as several ads
              under the <code className="font-mono">v##</code> convention.
            </p>
          </details>
        </div>

        {!collapsed && (
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
        )}
      </div>

      {/* Cards grid */}
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map(c => (
            <CreativeCard
              key={c.creativeSlug}
              creative={c}
              revenue={revenueBySlug[c.creativeSlug] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
