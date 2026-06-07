// src/components/pm/ScorecardsTab.jsx
import React, { useState, useMemo } from 'react';
import HealthBadge from './HealthBadge';

const BAND_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'critical', label: '🔴 Critical' },
  { value: 'risk',     label: '🟠 At Risk' },
  { value: 'watch',    label: '🟡 Watch' },
  { value: 'healthy',  label: '🟢 Healthy' },
];

function PmAuditSummary({ auditData, onAuditPmClick }) {
  if (!auditData?.pms?.length) return null;
  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-4 mb-4">
      <p className="text-white/40 text-xs font-medium mb-3">PM Pipeline Audit</p>
      <div className="flex flex-wrap gap-2">
        {auditData.pms.map(pm => {
          const hasIssues = pm.counts.urgent > 0 || pm.counts.red > 0;
          return (
            <button
              key={pm.name}
              onClick={() => onAuditPmClick(pm.name)}
              className={`px-3 py-2 rounded-xl border text-left transition-colors hover:bg-white/10 ${
                hasIssues
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <p className="text-sm font-medium text-white/80">{pm.name}</p>
              <div className="flex gap-1.5 text-xs mt-0.5">
                {pm.counts.urgent > 0 && <span className="text-red-400">🚨 {pm.counts.urgent}</span>}
                {pm.counts.red    > 0 && <span className="text-red-400">🔴 {pm.counts.red}</span>}
                {pm.counts.yellow > 0 && <span className="text-yellow-400">🟡 {pm.counts.yellow}</span>}
                {!hasIssues && pm.counts.yellow === 0 && (
                  <span className="text-green-400">✅ Clear</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ScorecardsTab({ data, auditData, onJobClick, onAuditPmClick }) {
  const [bandFilter, setBandFilter]   = useState('all');
  const [redoOnly, setRedoOnly]       = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(() => {
    return data.scorecards.filter(j => {
      if (bandFilter !== 'all' && j.band !== bandFilter) return false;
      if (redoOnly && !j.hasRedo) return false;
      if (overdueOnly && !j.hasOverdueSubtask) return false;
      return true;
    });
  }, [data.scorecards, bandFilter, redoOnly, overdueOnly]);

  return (
    <div>
      <PmAuditSummary auditData={auditData} onAuditPmClick={onAuditPmClick} />

      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">PM Scorecards</h2>
            <p className="text-white/40 text-xs mt-0.5">
              {filtered.length} of {data.scorecards.length} jobs · worst first
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={bandFilter}
              onChange={e => setBandFilter(e.target.value)}
              className="bg-white/10 text-white/80 text-xs rounded px-2 py-1 border border-white/10"
            >
              {BAND_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={redoOnly}
                onChange={e => setRedoOnly(e.target.checked)}
                className="accent-orange-400"
              />
              REDO only
            </label>
            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={e => setOverdueOnly(e.target.checked)}
                className="accent-red-400"
              />
              Overdue only
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 border-b border-white/5">
                <th className="text-left py-2 pr-4 font-medium">Score</th>
                <th className="text-left py-2 pr-4 font-medium">Job</th>
                <th className="text-left py-2 pr-4 font-medium">Due</th>
                <th className="text-left py-2 pr-4 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map(j => (
                <tr
                  key={j.gid}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                  onClick={() => onJobClick(j.gid)}
                >
                  <td className="py-2 pr-4">
                    <HealthBadge score={j.score} band={j.band} />
                  </td>
                  <td className="py-2 pr-4 text-white/80 max-w-xs truncate">{j.name}</td>
                  <td className={`py-2 pr-4 tabular-nums ${
                    j.due_on && j.due_on < new Date().toISOString().slice(0, 10)
                      ? 'text-red-400'
                      : 'text-white/40'
                  }`}>
                    {j.due_on ?? '—'}
                  </td>
                  <td className="py-2 flex gap-1">
                    {j.hasRedo && <span className="text-orange-400 font-bold">REDO</span>}
                    {j.hasOverdueSubtask && <span className="text-red-400">OVERDUE</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-white/30">
                    No jobs match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
