// src/sections/ExcellenceSection.jsx
import React, { useState, useEffect } from 'react';
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

  // Reset drill-down if active team disappears from data (e.g., sparse API response)
  useEffect(() => {
    if (activeTeam && data && !data.teams?.[activeTeam]) {
      setActiveTeam(null);
    }
  }, [data, activeTeam]);

  function toggleTeam(id) {
    setActiveTeam(prev => prev === id ? null : id);
  }

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Excellence</h1>
            {data && (
              <p className="text-gray-500 text-xs mt-1">
                Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReviewForm(true)}
              className="text-gray-500 hover:text-gray-900 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              Submit Culture Review
            </button>
            <button
              onClick={() => refresh(true)}
              className="text-gray-500 hover:text-gray-600 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Reviews banner */}
        <ReviewsBanner />

        {/* Period selector */}
        <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 w-fit">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.id ? 'bg-black/[0.05] text-gray-900' : 'text-gray-500 hover:text-gray-700'
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
            Error loading scores: {error?.message ?? String(error)}
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
          <div className="bg-black/[0.03] border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{teams[activeTeam].emoji}</span>
              <h2 className="text-lg font-bold">{teams[activeTeam].label}</h2>
              <span className="text-3xl font-bold tabular-nums ml-2">{teams[activeTeam].score}</span>
              <button onClick={() => setActiveTeam(null)} className="ml-auto text-gray-500 hover:text-gray-500 text-xl leading-none">×</button>
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
          <div className="bg-navy border border-gray-200 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <PeerReviewForm onClose={() => setShowReviewForm(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
