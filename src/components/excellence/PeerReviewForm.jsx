// src/components/excellence/PeerReviewForm.jsx
import React, { useState } from 'react';
import { usePeerReviews } from '../../hooks/usePeerReviews.js';

const TEAMS = [
  { id: 'pm',           label: 'PM',           emoji: '📋' },
  { id: 'sales',        label: 'Sales',        emoji: '📊' },
  { id: 'production',   label: 'Production',   emoji: '🏭' },
  { id: 'installation', label: 'Installation', emoji: '🔧' },
  { id: 'admin',        label: 'Admin',        emoji: '⚙️' },
];

const DIMENSIONS = [
  { key: 'communication',    label: 'Communication',     desc: 'Clear and fast?' },
  { key: 'accountability',   label: 'Accountability',    desc: 'Owning their work?' },
  { key: 'attitude',         label: 'Attitude',          desc: 'Positive and collaborative?' },
  { key: 'processAdherence', label: 'Process Adherence', desc: 'Following the playbook?' },
];

function ScoreInput({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-7 h-7 rounded text-xs font-bold transition-all ${
            n <= value
              ? n >= 8 ? 'bg-success text-white' : n >= 5 ? 'bg-warning text-black' : 'bg-danger text-white'
              : 'bg-white/5 text-white/30 hover:bg-white/10'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function PeerReviewForm({ onClose }) {
  const { submitReview, submitting, error, submitted } = usePeerReviews();
  const [step, setStep] = useState(0); // 0 = team select, 1 = scoring
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState({ communication: 5, accountability: 5, attitude: 5, processAdherence: 5 });

  function handleSubmit() {
    submitReview({ ...scores, team: selectedTeam, reviewer: 'daniel' });
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-white font-semibold">Review submitted!</p>
        <p className="text-white/40 text-sm mt-1">Culture score will update on next refresh.</p>
        <button onClick={onClose} className="mt-4 text-accent text-sm hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Monthly Culture Review</h3>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
      </div>

      {step === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-white/40">Which team are you reviewing?</p>
          {TEAMS.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelectedTeam(t.id); setStep(1); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.06] transition-colors text-left"
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="text-sm font-medium text-white">{t.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(0)} className="text-white/30 hover:text-white/60 text-sm">← Back</button>
            <span className="text-sm text-white/60">
              {TEAMS.find(t => t.id === selectedTeam)?.emoji} {TEAMS.find(t => t.id === selectedTeam)?.label}
            </span>
          </div>

          {DIMENSIONS.map(d => (
            <div key={d.key} className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-white/70">{d.label}</p>
                <p className="text-[11px] text-white/30">{d.desc}</p>
              </div>
              <ScoreInput value={scores[d.key]} onChange={v => setScores(s => ({ ...s, [d.key]: v }))} />
            </div>
          ))}

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      )}
    </div>
  );
}
