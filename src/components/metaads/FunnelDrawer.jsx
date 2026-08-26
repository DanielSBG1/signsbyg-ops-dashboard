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

/**
 * Reusable slide-out drawer for funnel drill-downs.
 * Modes: 'deals' | 'repeats'
 */
export default function FunnelDrawer({ mode, preset, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset: preset || 'year' });
    if (mode === 'repeats') params.set('mode', 'repeats');

    fetch(`/api/meta-ads-deals?${params}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error || 'API error');
        setData(json.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [preset, mode]);

  const repeatCustomers = data?.repeatCustomers ?? [];

  const title = mode === 'repeats' ? 'Repeat Customers' : 'Attributed Deals';
  const subtitle = mode === 'repeats'
    ? 'Customers who ordered more than once from Meta Ads'
    : 'Deals grouped by pipeline';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                {data.period.start} → {data.period.end}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
          )}

          {/* Repeat Customers View */}
          {data && mode === 'repeats' && (
            repeatCustomers.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No repeat customers found.</div>
            ) : (
              repeatCustomers.map((customer, i) => (
                <div key={customer.contactId || i} className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-amber-500 text-2xl">★</span>
                      <div>
                        <p className="font-bold text-gray-900">Repeat Customer #{i + 1}</p>
                        <p className="text-xs text-amber-700">
                          From: <span className="font-medium">{customer.source}</span>
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {customer.dealCount} orders · {fmtMoney(customer.totalRevenue)} total revenue
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-amber-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-amber-100">
                          <th className="text-left px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Deal</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Amount</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Rep</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Source</th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Pipeline</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">Closed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {customer.deals.map((deal, j) => (
                          <tr key={j} className="hover:bg-amber-50 transition-colors">
                            <td className="px-5 py-2.5">
                              <p className="text-gray-900 text-xs font-medium truncate max-w-[250px]" title={deal.name}>{deal.name}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900 text-xs">
                              {fmtMoney(deal.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-600">{deal.rep}</td>
                            <td className="px-3 py-2.5 text-xs">
                              {deal.adSetName ? (
                                <span className="text-purple-600 font-medium">{deal.adSetName}</span>
                              ) : deal.campaignName ? (
                                <span className="text-gray-500">{deal.campaignName}</span>
                              ) : (
                                <span className="text-gray-300">unknown</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">{deal.pipeline}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums">{fmtDate(deal.closeDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )
          )}

          {/* Deals View (grouped by pipeline) */}
          {data && mode === 'deals' && data.pipelines.map(pipeline => (
            <div key={pipeline.pipeline} className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
                  <span className="font-bold text-gray-900">{pipeline.pipeline}</span>
                  <span className="text-xs text-gray-400">{pipeline.deals.length} deals</span>
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums">{fmtMoney(pipeline.totalRevenue)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-gray-100">
                    <th className="text-left px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Deal</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Amount</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Rep</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Source</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Lead In</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Closed</th>
                    <th className="text-right px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pipeline.deals.map(deal => (
                    <tr key={deal.dealId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-900 truncate max-w-[220px]" title={deal.name}>{deal.name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(deal.amount)}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{deal.rep}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {deal.adSet ? (
                          <div>
                            <span className="text-purple-600 font-medium">{deal.adSet}</span>
                            <span className="text-gray-400 block text-[10px] truncate max-w-[140px]">{deal.campaign}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500 truncate max-w-[140px]" title={deal.campaign}>{deal.campaign}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">{fmtDate(deal.leadCreatedAt)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">{fmtDate(deal.closeDate)}</td>
                      <td className={`px-5 py-2.5 text-right tabular-nums text-xs font-semibold ${velocityColor(deal.daysToClose)}`}>
                        {deal.daysToClose != null ? `${deal.daysToClose}d` : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {data && mode === 'deals' && data.pipelines.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No attributed deals found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
