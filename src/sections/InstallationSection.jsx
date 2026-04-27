import React from 'react';
import { useInstallationMetrics } from '../hooks/useInstallationMetrics';
import SummaryCards from '../components/installation/SummaryCards';
import SectionPipeline from '../components/installation/SectionPipeline';
import CrewScorecard from '../components/installation/CrewScorecard';
import JobsTable from '../components/installation/JobsTable';
import PipelineBar from '../components/installation/PipelineBar';
import ScheduleSection from '../components/installation/ScheduleSection';

export default function InstallationSection() {
  const { data, loading, error, lastRefreshed, refresh } = useInstallationMetrics();

  return (
    <div className="min-h-screen text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold">Installation</h1>
          {lastRefreshed && (
            <p className="text-white/40 text-xs mt-1">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            Failed to load data: {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-white/40 text-sm">Loading installation data...</p>
            </div>
          </div>
        ) : data ? (
          <>
            <ScheduleSection schedule={data.schedule} />
            <PipelineBar summary={data.summary} jobs={data.jobs} />
            <SummaryCards summary={data.summary} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionPipeline bySection={data.bySection} />
              <CrewScorecard byCrew={data.byCrew} />
            </div>
            <JobsTable jobs={data.jobs} />
          </>
        ) : null}
      </main>
    </div>
  );
}
