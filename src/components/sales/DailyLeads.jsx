import React, { useState, useEffect, useCallback } from 'react';

const SOURCE_COLORS = {
  Facebook: '#3b82f6',
  'Direct / Website': '#8b5cf6',
  Organic: '#22c55e',
  Referral: '#f59e0b',
  'Phone Call': '#06b6d4',
  'Manual Entry': '#6b7280',
  Email: '#ec4899',
  Unknown: '#94a3b8',
};

function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

export default function DailyLeads() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/daily-leads');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-48 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 text-danger text-sm">
        Failed to load daily leads: {error}
      </div>
    );
  }

  if (!data) return null;

  const {
    totalLeads, hubspotLeads, callLeads, sameDayDeals,
    conversionRate, sourceBreakdown, contacts, callLeads: callLeadsList, deals,
  } = data;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Today's Leads</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            All new lead intake · Auto-refreshes every 2 min
          </p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
        >
          {expanded ? 'Collapse' : 'Details'}
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
        <KpiCard
          label="TOTAL NEW LEADS"
          value={totalLeads}
          valueClass="text-accent text-4xl"
          sub={`${hubspotLeads} HubSpot · ${callLeads} phone calls`}
        />
        <KpiCard
          label="SAME-DAY DEALS"
          value={sameDayDeals}
          valueClass={sameDayDeals > 0 ? 'text-success text-4xl' : 'text-gray-400 text-4xl'}
          sub={`${conversionRate}% conversion rate`}
        />
        <KpiCard
          label="TOP SOURCE"
          value={topSource(sourceBreakdown)}
          valueClass="text-gray-900 text-lg"
          sub={topSourceCount(sourceBreakdown)}
        />
        <KpiCard
          label="PHONE LEADS"
          value={callLeads}
          valueClass={callLeads > 0 ? 'text-cyan-600 text-4xl' : 'text-gray-400 text-4xl'}
          sub="AI-classified from calls"
        />
      </div>

      {/* ── Source breakdown bar ── */}
      {totalLeads > 0 && (
        <div className="px-6 py-3 border-t border-gray-100">
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            {Object.entries(sourceBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => (
                <div
                  key={src}
                  style={{
                    width: `${(count / hubspotLeads) * 100}%`,
                    backgroundColor: SOURCE_COLORS[src] || '#94a3b8',
                  }}
                  title={`${src}: ${count}`}
                />
              ))}
            {callLeads > 0 && (
              <div
                style={{
                  width: `${(callLeads / totalLeads) * 100}%`,
                  backgroundColor: '#06b6d4',
                }}
                title={`Phone Leads: ${callLeads}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {Object.entries(sourceBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([src, count]) => (
                <span key={src} className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: SOURCE_COLORS[src] || '#94a3b8' }}
                  />
                  {src} {count}
                </span>
              ))}
            {callLeads > 0 && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block bg-cyan-500" />
                Phone Leads {callLeads}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* HubSpot leads */}
          {contacts.length > 0 && (
            <div className="px-6 py-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                HubSpot Leads ({contacts.length})
              </h3>
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                      {c.email && <span className="text-xs text-gray-500 ml-2">{c.email}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: (SOURCE_COLORS[classifySourceSimple(c.source)] || '#94a3b8') + '20',
                          color: SOURCE_COLORS[classifySourceSimple(c.source)] || '#94a3b8',
                        }}
                      >
                        {classifySourceSimple(c.source)}
                      </span>
                      <span className="text-xs text-gray-400">{formatTime(c.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phone call leads */}
          {callLeadsList.length > 0 && (
            <div className="px-6 py-4 bg-cyan-50/30">
              <h3 className="text-xs font-semibold text-cyan-700 uppercase tracking-wider mb-3">
                Phone Call Leads ({callLeadsList.length})
              </h3>
              <div className="space-y-2">
                {callLeadsList.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-cyan-100/50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{formatPhone(c.phone)}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {c.rep || 'Unknown'} · {Math.round((c.duration || 0) / 60)}m
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.summary && (
                        <span className="text-xs text-gray-500 max-w-[200px] truncate">{c.summary}</span>
                      )}
                      <span className="text-xs text-gray-400">{formatTime(c.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Same-day deals */}
          {deals.length > 0 && (
            <div className="px-6 py-4 bg-green-50/30">
              <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3">
                Same-Day Deals ({deals.length})
              </h3>
              <div className="space-y-2">
                {deals.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm font-medium text-gray-900">{d.name}</span>
                    <span className="text-sm font-bold text-success">
                      ${(d.amount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper components ──

function KpiCard({ label, value, valueClass, sub }) {
  return (
    <div className="bg-white p-5">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`font-bold mt-1 tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function classifySourceSimple(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('paid_social') || s.includes('facebook')) return 'Facebook';
  if (s.includes('organic')) return 'Organic';
  if (s.includes('direct')) return 'Direct / Website';
  if (s.includes('referral')) return 'Referral';
  if (s === 'offline') return 'Phone Call';
  return source || 'Unknown';
}

function topSource(breakdown) {
  const entries = Object.entries(breakdown || {});
  if (entries.length === 0) return 'None';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function topSourceCount(breakdown) {
  const entries = Object.entries(breakdown || {});
  if (entries.length === 0) return 'No leads yet';
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][1]} leads from ${entries[0][0]}`;
}
