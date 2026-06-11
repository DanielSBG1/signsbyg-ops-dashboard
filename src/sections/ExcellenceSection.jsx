// src/sections/ExcellenceSection.jsx
import React, { useState } from 'react';
import { useExcellenceScores } from '../hooks/useExcellenceScores.js';
import TeamScorecard  from '../components/excellence/TeamScorecard.jsx';
import TeamDrillDown  from '../components/excellence/TeamDrillDown.jsx';
import CompanyTrend   from '../components/excellence/CompanyTrend.jsx';
import PeerReviewForm from '../components/excellence/PeerReviewForm.jsx';
import ReviewsBanner  from '../components/excellence/ReviewsBanner.jsx';

const PERIODS = [
  { id: 'week',      label: 'This Week' },
  { id: 'month',     label: 'This Month' },
  { id: 'quarter',   label: 'This Quarter' },
  { id: 'lastmonth', label: 'Last Month' },
];

const TEAM_ORDER = ['pm', 'sales', 'production', 'installation', 'admin'];

export default function ExcellenceSection() {
  const [period, setPeriod]           = useState('month');
  const [activeTeam, setActiveTeam]   = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const { data, loading, error, refresh } = useExcellenceScores(period);

  const teams = data?.teams ?? {};

  function toggleTeam(id) {
    setActiveTeam(prev => prev === id ? null : id);
  }

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Excellence</h1>
            {data && (
              <p className="text-white/40 text-xs mt-1">
                Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReviewForm(true)}
              className="text-white/50 hover:text-white text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
            >
              Submit Culture Review
            </button>
            <button
              onClick={() => refresh(true)}
              className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Reviews banner */}
        <ReviewsBanner />

        {/* Period selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Loading / error */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">
            Error loading scores: {error}
          </div>
        )}

        {/* Scorecards row */}
        {data && (
          <div className="flex gap-3 flex-wrap">
            {TEAM_ORDER.map(id => (
              <TeamScorecard
                key={id}
                team={teams[id]}
                isActive={activeTeam === id}
                onClick={() => toggleTeam(id)}
              />
            ))}
          </div>
        )}

        {/* Drill-down panel */}
        {activeTeam && teams[activeTeam] && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{teams[activeTeam].emoji}</span>
              <h2 className="text-lg font-bold">{teams[activeTeam].label}</h2>
              <span className="text-3xl font-bold tabular-nums ml-2">{teams[activeTeam].score}</span>
              <button onClick={() => setActiveTeam(null)} className="ml-auto text-white/30 hover:text-white/60 text-xl leading-none">×</button>
            </div>
            <TeamDrillDown team={teams[activeTeam]} />
          </div>
        )}

        {/* Company trend */}
        {data?.history && <CompanyTrend history={data.history} />}

      </div>

      {/* Peer review modal */}
      {showReviewForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <PeerReviewForm onClose={() => setShowReviewForm(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
