import React, { useState } from 'react';

const CLASS_LABELS = {
  new_prospect: 'New Prospect',
  existing_lead: 'Existing Lead',
  existing_deal: 'Existing Deal',
  existing_customer: 'Existing Customer',
  unknown: 'Unknown',
};

const CLASS_STYLES = {
  new_prospect: 'bg-success/20 text-success border-success/30',
  existing_lead: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  existing_deal: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  existing_customer: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  unknown: 'bg-black/[0.05] text-gray-500 border-gray-200',
};

const STATUS_STYLES = {
  completed: 'text-success',
  missed: 'text-danger',
  voicemail: 'text-yellow-400',
  'no-answer': 'text-yellow-400',
};

function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function CallsPage({ data, loading, error }) {
  const [filterClass, setFilterClass] = useState('all');
  const [filterDirection, setFilterDirection] = useState('all');

  if (error) {
    return (
      <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm">
        Failed to load calls: {error}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading calls...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (data.error) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ OpenPhone not configured</h2>
        <p className="text-gray-500 text-sm">
          Add <code className="bg-black/[0.05] px-1.5 py-0.5 rounded">OPENPHONE_API_KEY</code> to your environment variables and redeploy.
        </p>
      </div>
    );
  }

  const { calls, summary, summaryOnly, phoneEnrichmentPartial, source } = data;

  let filtered = calls;
  if (filterClass !== 'all') filtered = filtered.filter((c) => c.classification === filterClass);
  if (filterDirection !== 'all') filtered = filtered.filter((c) => c.direction === filterDirection);

  return (
    <div className="space-y-6">
      {/* Polling fallback banner — shown when KV store is empty (bootstrap state) */}
      {source === 'polling-fallback-unavailable' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-5 py-4 text-yellow-300 text-sm">
          ⚙ Calls service is initializing — full data will be available shortly once the webhook store is populated.
        </div>
      )}
      {source === 'polling-fallback' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-5 py-4 text-yellow-300 text-sm">
          ⚠ Showing data from polling fallback — only HubSpot-known contacts are matched
          {data.meta?.cappedAt && (
            <> (capped at first {data.meta.cappedAt} phones to limit API costs)</>
          )}
          . Full data available once the webhook store is ready.
        </div>
      )}
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-9 gap-3">
        <Kpi label="Total Calls" value={summary.total} />
        <Kpi label="📞 Inbound" value={summary.inbound} colorClass="text-blue-300" />
        <Kpi label="📤 Outbound" value={summary.outbound} colorClass="text-purple-300" />
        <Kpi label="✓ Answered" value={summary.answered} colorClass="text-success" />
        <Kpi label="❌ Missed" value={summary.missed ?? '—'} colorClass="text-danger" subtext="no message left" />
        <Kpi label="📨 Voicemails" value={summary.voicemail ?? '—'} colorClass="text-yellow-400" subtext="go listen & call back" />
        <Kpi label="⏱ Avg Length" value={formatDuration(summary.avgDuration)} />
        <Kpi label="📞 Unique Callers" value={summary.uniqueInboundCallers ?? '—'} colorClass="text-blue-300" />
        <Kpi label="🆕 New Inquiries" value={summary.newInquiries ?? '—'} colorClass="text-success" subtext="new prospects, inbound" />
      </div>

      {/* Classification breakdown — skipped for wide periods */}
      {summary.byClassification ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Call Classification</h2>
            {phoneEnrichmentPartial && (
              <span
                className="text-yellow-400/70 text-xs"
                title="Some HubSpot lookups failed — classification may be partially incomplete (some calls may show as 'new_prospect' that are actually existing)"
              >
                ⚠ partial contact match
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ClassCard label="🆕 New Prospects" value={summary.byClassification.new_prospect} keyId="new_prospect" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="📋 Existing Leads" value={summary.byClassification.existing_lead} keyId="existing_lead" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="💼 Existing Deals" value={summary.byClassification.existing_deal} keyId="existing_deal" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="⭐ Existing Customers" value={summary.byClassification.existing_customer} keyId="existing_customer" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="❓ Unknown" value={summary.byClassification.unknown} keyId="unknown" filterClass={filterClass} setFilterClass={setFilterClass} />
          </div>
        </div>
      ) : null}

      {/* Call Sources card */}
      {summary.bySource && summary.bySource.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">📡 How Callers Found Us</h2>
            <span className="text-gray-500 text-xs">identified inbound callers only</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.bySource.map((s) => (
              <div key={s.source} className="bg-black/[0.03] rounded-xl p-4">
                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1 truncate">{s.source}</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{s.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Volume table */}
      {summary.byDay && summary.byDay.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">📅 Daily Volume</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 text-left">Date</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Inbound</th>
                  <th className="pb-3 text-right">Outbound</th>
                  <th className="pb-3 text-right">Unique Callers</th>
                  <th className="pb-3 text-right">New Inquiries</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map((d) => (
                  <tr key={d.date} className="border-t border-gray-200 hover:bg-black/[0.03]">
                    <td className="py-2 text-gray-600">{new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="py-2 text-right tabular-nums text-gray-700">{d.total}</td>
                    <td className="py-2 text-right tabular-nums text-blue-300">{d.inbound}</td>
                    <td className="py-2 text-right tabular-nums text-purple-300">{d.outbound}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{d.uniqueCallers}</td>
                    <td className="py-2 text-right tabular-nums text-success">{d.newInquiries || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calls table — hidden for wide periods */}
      {summaryOnly ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-500 text-sm py-10">
          Call log and classification breakdown are only available for periods up to 2 weeks.<br />
          Switch to <span className="text-gray-500">Today</span>, <span className="text-gray-500">This Week</span>, or a custom range ≤14 days to see individual calls.
        </div>
      ) : (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Call Log</h2>
            <span className="text-gray-500 text-sm">{filtered.length} of {calls.length} showing</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="bg-black/[0.03] border border-gray-200 rounded-lg px-3 py-1 text-sm text-gray-700"
            >
              <option value="all">All Directions</option>
              <option value="incoming">Inbound</option>
              <option value="outgoing">Outbound</option>
            </select>
            {(filterClass !== 'all' || filterDirection !== 'all') && (
              <button
                onClick={() => { setFilterClass('all'); setFilterDirection('all'); }}
                className="px-3 py-1 text-xs rounded-full bg-black/[0.05] hover:bg-white/15 text-gray-500"
              >
                Clear filters &times;
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No calls match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 px-3 text-left">Time</th>
                  <th className="pb-3 px-3 text-left">Direction</th>
                  <th className="pb-3 px-3 text-left">Caller</th>
                  <th className="pb-3 px-3 text-left">Phone</th>
                  <th className="pb-3 px-3 text-left">Classification</th>
                  <th className="pb-3 px-3 text-left">Rep</th>
                  <th className="pb-3 px-3 text-right">Duration</th>
                  <th className="pb-3 px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-gray-200 hover:bg-black/[0.03]">
                    <td className="py-3 px-3 text-gray-500 text-xs">
                      {c.createdAt ? new Date(c.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      }) : '—'}
                    </td>
                    <td className="py-3 px-3">
                      {c.direction === 'incoming' ? (
                        <span className="text-blue-300">📞 In</span>
                      ) : c.direction === 'outgoing' ? (
                        <span className="text-purple-300">📤 Out</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-3 text-gray-900 font-medium">{c.contactName || <span className="text-gray-500 italic">Unknown</span>}</td>
                    <td className="py-3 px-3 text-gray-500 tabular-nums">{formatPhone(c.customerPhone)}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${CLASS_STYLES[c.classification] || ''}`}>
                        {CLASS_LABELS[c.classification] || c.classification}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-700 text-xs">{c.rep}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-gray-600">{formatDuration(c.duration)}</td>
                    <td className={`py-3 px-3 text-xs ${STATUS_STYLES[c.status] || 'text-gray-500'}`}>
                      {c.voicemail ? 'voicemail' : c.status || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function Kpi({ label, value, colorClass = 'text-gray-900', subtext }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
      {subtext && <p className="text-gray-500 text-[10px] mt-0.5">{subtext}</p>}
    </div>
  );
}

function ClassCard({ label, value, keyId, filterClass, setFilterClass }) {
  const isActive = filterClass === keyId;
  return (
    <button
      onClick={() => setFilterClass(isActive ? 'all' : keyId)}
      className={`bg-black/[0.03] hover:bg-black/[0.05] rounded-xl p-4 text-left transition-all ${
        isActive ? 'ring-2 ring-accent' : ''
      }`}
    >
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
    </button>
  );
}
