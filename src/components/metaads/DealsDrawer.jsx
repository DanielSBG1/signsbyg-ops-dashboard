import React, { useState, useEffect } from 'react';

function fmtMoney(val) {
  if (val == null) return '$0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(num)) return '$0';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso) {
  if (!iso) return '---';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function velocityColor(days) {
  if (days == null) return 'text-gray-400';
  if (days <= 30) return 'text-success';
  if (days <= 60) return 'text-warning';
  return 'text-danger';
}

export default function DealsDrawer({ preset, campaignId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsedPipelines, setCollapsedPipelines] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset: preset || 'year' });
    if (campaignId) params.set('campaignId', campaignId);

    fetch(`/api/meta-ads-deals?${params}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error || 'API error');
        setData(json.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [preset, campaignId]);

  const togglePipeline = (name) => {
    setCollapsedPipelines(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Attributed Deals</h2>
            {data && (
              <p className="text-xs text-gray-500 mt-0.5">
                {data.totalDeals} deals · {fmtMoney(data.totalRevenue)} revenue · {data.period.start} → {data.period.end}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          {data && data.pipelines.map(pipeline => {
            const isCollapsed = collapsedPipelines.has(pipeline.pipeline);
            return (
              <div key={pipeline.pipeline} className="border border-gray-200 rounded-2xl overflow-hidden">
                {/* Pipeline header */}
                <button
                  onClick={() => togglePipeline(pipeline.pipeline)}
                  className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
                    <span className="font-bold text-gray-900">{pipeline.pipeline}</span>
                    <span className="text-xs text-gray-400">
                      {pipeline.deals.length} deal{pipeline.deals.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {fmtMoney(pipeline.totalRevenue)}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </div>
                </button>

                {/* Deals table */}
                {!isCollapsed && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Deal</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Amount</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Rep</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Campaign</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Lead In</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Closed</th>
                          <th className="text-right px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {pipeline.deals.map(deal => (
                          <tr key={deal.dealId} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-2.5">
                              <p className="font-medium text-gray-900 truncate max-w-[220px]" title={deal.name}>
                                {deal.name}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                              {fmtMoney(deal.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">
                              {deal.rep}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-[140px]" title={deal.campaign}>
                              {deal.campaign}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">
                              {fmtDate(deal.leadCreatedAt)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">
                              {fmtDate(deal.closeDate)}
                            </td>
                            <td className={`px-5 py-2.5 text-right tabular-nums text-xs font-semibold ${velocityColor(deal.daysToClose)}`}>
                              {deal.daysToClose != null ? `${deal.daysToClose}d` : '---'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {data && data.pipelines.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No attributed deals found for this period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
