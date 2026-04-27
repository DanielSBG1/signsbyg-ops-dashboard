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
  unknown: 'bg-white/10 text-white/40 border-white/10',
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
          <p className="text-white/40 text-sm">Loading calls...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (data.error) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ OpenPhone not configured</h2>
        <p className="text-white/60 text-sm">
          Add <code className="bg-white/10 px-1.5 py-0.5 rounded">OPENPHONE_API_KEY</code> to your environment variables and redeploy.
        </p>
      </div>
    );
  }

  const { calls, summary, summaryOnly } = data;

  let filtered = calls;
  if (filterClass !== 'all') filtered = filtered.filter((c) => c.classification === filterClass);
  if (filterDirection !== 'all') filtered = filtered.filter((c) => c.direction === filterDirection);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total Calls" value={summary.total} />
        <Kpi label="📞 Inbound" value={summary.inbound} colorClass="text-blue-300" />
        <Kpi label="📤 Outbound" value={summary.outbound} colorClass="text-purple-300" />
        <Kpi label="✓ Answered" value={summary.answered} colorClass="text-success" />
        <Kpi label="❌ Missed" value={summary.missed} colorClass="text-danger" />
        <Kpi label="⏱ Avg Length" value={formatDuration(summary.avgDuration)} />
      </div>

      {/* Classification breakdown — skipped for wide periods */}
      {summary.byClassification ? (
        <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Call Classification</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ClassCard label="🆕 New Prospects" value={summary.byClassification.new_prospect} keyId="new_prospect" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="📋 Existing Leads" value={summary.byClassification.existing_lead} keyId="existing_lead" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="💼 Existing Deals" value={summary.byClassification.existing_deal} keyId="existing_deal" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="⭐ Existing Customers" value={summary.byClassification.existing_customer} keyId="existing_customer" filterClass={filterClass} setFilterClass={setFilterClass} />
            <ClassCard label="❓ Unknown" value={summary.byClassification.unknown} keyId="unknown" filterClass={filterClass} setFilterClass={setFilterClass} />
          </div>
        </div>
      ) : null}

      {/* Calls table — hidden for wide periods */}
      {summaryOnly ? (
        <div className="bg-slate-card border border-white/5 rounded-2xl p-6 text-center text-white/40 text-sm py-10">
          Call log and classification breakdown are only available for periods up to 2 weeks.<br />
          Switch to <span className="text-white/60">Today</span>, <span className="text-white/60">This Week</span>, or a custom range ≤14 days to see individual calls.
        </div>
      ) : (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Call Log</h2>
            <span className="text-white/40 text-sm">{filtered.length} of {calls.length} showing</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white/80"
            >
              <option value="all">All Directions</option>
              <option value="incoming">Inbound</option>
              <option value="outgoing">Outbound</option>
            </select>
            {(filterClass !== 'all' || filterDirection !== 'all') && (
              <button
                onClick={() => { setFilterClass('all'); setFilterDirection('all'); }}
                className="px-3 py-1 text-xs rounded-full bg-white/10 hover:bg-white/15 text-white/60"
              >
                Clear filters &times;
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-8">No calls match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase tracking-wider">
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
                  <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="py-3 px-3 text-white/60 text-xs">
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
                    <td className="py-3 px-3 text-white font-medium">{c.contactName || <span className="text-white/40 italic">Unknown</span>}</td>
                    <td className="py-3 px-3 text-white/60 tabular-nums">{formatPhone(c.customerPhone)}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${CLASS_STYLES[c.classification] || ''}`}>
                        {CLASS_LABELS[c.classification] || c.classification}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-white/80 text-xs">{c.rep}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-white/70">{formatDuration(c.duration)}</td>
                    <td className={`py-3 px-3 text-xs ${STATUS_STYLES[c.status] || 'text-white/50'}`}>
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

function Kpi({ label, value, colorClass = 'text-white' }) {
  return (
    <div className="bg-slate-card border border-white/5 rounded-xl p-4">
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}

function ClassCard({ label, value, keyId, filterClass, setFilterClass }) {
  const isActive = filterClass === keyId;
  return (
    <button
      onClick={() => setFilterClass(isActive ? 'all' : keyId)}
      className={`bg-white/5 hover:bg-white/10 rounded-xl p-4 text-left transition-all ${
        isActive ? 'ring-2 ring-accent' : ''
      }`}
    >
      <p className="text-white/60 text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
    </button>
  );
}
