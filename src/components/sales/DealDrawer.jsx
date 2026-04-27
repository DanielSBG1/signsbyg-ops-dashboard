import React from 'react';
import { formatMoney, REASON_LABELS } from './PipelineHealthDealList';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function bucketBadge(deal) {
  const isStaleHot =
    deal.reason === 'hot_stage' &&
    (deal.stageAgeDays || 0) > 20;
  if (isStaleHot) return { label: '🔥 Hot — stale (>20d in stage)', color: 'text-red-400' };
  if (deal.reason === 'hot_stage' || deal.reason === 'velocity')
    return { label: '🔥 Hot deal', color: 'text-orange-400' };
  if (
    ['hot_stage_decayed', 'velocity_decayed', 'age_threshold', 'stuck_pre_design'].includes(
      deal.reason
    )
  )
    return { label: '⚠️ Aging deal', color: 'text-yellow-400' };
  if (deal.reason === 'too_old') return { label: '🥶 Cold deal', color: 'text-blue-300' };
  return { label: '', color: '' };
}

function Field({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <span className="text-[10px] text-white/35">{label}</span>
      <span className="text-xs text-white/80 font-medium text-right max-w-[180px]">{value}</span>
    </div>
  );
}

export default function DealDrawer({ deal, onClose }) {
  const isOpen = Boolean(deal);

  return (
    <div
      className={`fixed top-0 right-0 h-full w-80 bg-[#1a1a2e] border-l border-white/8 z-50 flex flex-col
        transition-transform duration-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {deal && (
        <div className="flex flex-col h-full overflow-y-auto p-5 gap-0">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-bold text-white/35 uppercase tracking-widest">
              Deal Detail
            </span>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 text-sm px-1.5 py-0.5 leading-none"
            >
              ✕
            </button>
          </div>

          {/* Deal name + badge */}
          <div className="mb-4">
            <div className="text-[15px] font-bold text-white leading-snug mb-1">{deal.name}</div>
            {(() => {
              const { label, color } = bucketBadge(deal);
              return label ? (
                <div className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>
                  {label}
                </div>
              ) : null;
            })()}
          </div>

          {/* Fields */}
          <div className="border-t border-white/6 mb-4">
            <Field label="Current stage" value={deal.stageLabel} />
            <Field label="Owner" value={deal.ownerName} />
            <Field label="Amount" value={formatMoney(deal.amount)} />
            <Field label="Stage age" value={`${deal.stageAgeDays}d in this stage`} />
            <Field label="Signal" value={REASON_LABELS[deal.reason] || deal.reason} />
            <Field label="Created" value={formatDate(deal.createdate)} />
            <Field label="Last contacted" value={formatDate(deal.lastContacted)} />
          </div>

          {/* Next step box */}
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 mb-4">
            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">
              📋 Next step per SOP
            </div>
            {deal.nextStageLabel ? (
              <>
                <div className="text-xs font-semibold text-white leading-snug">
                  → Move to: {deal.nextStageLabel}
                </div>
                <div className="text-[10px] text-white/40 mt-1">
                  Based on pipeline SOP stage order
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-white leading-snug">
                  ✅ Final stage — close the deal
                </div>
                <div className="text-[10px] text-white/40 mt-1">
                  Deal is ready to mark as Won or Lost
                </div>
              </>
            )}
          </div>

          {/* HubSpot button */}
          {deal.hubspotUrl && (
            <a
              href={deal.hubspotUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-orange-500/13 border border-orange-500/30
                rounded-lg p-2.5 text-orange-400 text-xs font-semibold no-underline
                hover:bg-orange-500/22 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7.5" stroke="#f97316" />
                <path d="M5 8h6M9 6l2 2-2 2" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Open in HubSpot
            </a>
          )}
        </div>
      )}
    </div>
  );
}
