import React, { useState, lazy, Suspense } from 'react';
import { useMetrics } from '../hooks/sales/useMetrics';
import { useHandoffs } from '../hooks/sales/useHandoffs';
import { useCalls } from '../hooks/sales/useCalls';
import { useRepActivity } from '../hooks/sales/useRepActivity';
import TopBar from '../components/sales/TopBar';
import MetricCards from '../components/sales/MetricCards';
import Funnel from '../components/sales/Funnel';
import Leaderboard from '../components/sales/Leaderboard';
import PipelineHealth from '../components/sales/PipelineHealth';
import PipelineHealthSummary from '../components/sales/PipelineHealthSummary';
import SourceBreakdown from '../components/sales/SourceBreakdown';
import LeadDetail from '../components/sales/LeadDetail';
import DealDetail from '../components/sales/DealDetail';
import SpeedToLead from '../components/sales/SpeedToLead';
import RepActivity from '../components/sales/RepActivity';

const PipelineHealthPage = lazy(() => import('../components/sales/PipelineHealthPage'));
const CallsPage          = lazy(() => import('../components/sales/CallsPage'));
const Handoffs           = lazy(() => import('../components/sales/Handoffs'));

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function SalesSection() {
  const [tab, setTab] = useState('sales');
  const [filterRep, setFilterRep] = useState(null);
  const [filterRepStatusHint, setFilterRepStatusHint] = useState(null);
  const [funnelFilter, setFunnelFilter] = useState(null);
  const [visitedTabs, setVisitedTabs] = useState({ sales: true, pipeline: true });

  function handleTabChange(t) {
    setTab(t);
    if (!visitedTabs[t]) setVisitedTabs(v => ({ ...v, [t]: true }));
  }

  const metricsEnabled  = visitedTabs.sales || visitedTabs.pipeline;
  const handoffsEnabled = visitedTabs.handoffs;
  const callsEnabled    = visitedTabs.calls;

  const metrics     = useMetrics(metricsEnabled);
  const handoffs    = useHandoffs(handoffsEnabled);
  const callsData   = useCalls(callsEnabled);
  const repActivity = useRepActivity(metricsEnabled, metrics.period, metrics.customRange);

  const active = tab === 'handoffs' ? handoffs : tab === 'calls' ? callsData : metrics;

  return (
    <div className="min-h-screen">
      <TopBar
        tab={tab}
        setTab={handleTabChange}
        period={active.period}
        setPeriod={active.setPeriod}
        customRange={active.customRange}
        setCustomRange={active.setCustomRange}
        lastRefreshed={active.lastRefreshed}
        onRefresh={active.refresh}
        loading={active.loading || active.refreshing}
      />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {tab === 'sales' && (
          <>
            {metrics.error && (
              <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm">
                Failed to load data: {metrics.error}
              </div>
            )}
            {metrics.loading && !metrics.data ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/40 text-sm">Loading dashboard...</p>
                </div>
              </div>
            ) : metrics.data ? (
              <>
                <MetricCards summary={metrics.data.summary} period={metrics.period} />
                <SpeedToLead sla={metrics.data.sla} />
                <Leaderboard
                  reps={metrics.data.reps}
                  selectedRep={filterRep}
                  onRepClick={(repId, sortKey) => {
                    setFilterRep(repId);
                    if (!repId) { setFilterRepStatusHint(null); return; }
                    const hint = (sortKey === 'leadsAssigned' || sortKey === 'avgResponseMinutes')
                      ? 'new_lead' : 'qualified';
                    setFilterRepStatusHint(hint);
                  }}
                />
                <RepActivity reps={metrics.data.reps} data={repActivity.data} />
                <PipelineHealthSummary
                  pipelineHealth={metrics.data.pipelineHealth}
                  onViewFullReport={() => handleTabChange('pipeline')}
                />
                <Funnel
                  funnel={metrics.data.funnel}
                  funnelActivity={metrics.data.funnelActivity}
                  reps={metrics.data.reps}
                  onCellClick={setFunnelFilter}
                  activeCell={funnelFilter}
                />
                {funnelFilter && (funnelFilter.row === 'deals' || funnelFilter.row === 'won' || funnelFilter.row === 'decided') ? (
                  <DealDetail
                    cohortDeals={metrics.data.cohortDeals}
                    periodDeals={metrics.data.periodDeals}
                    funnelFilter={funnelFilter}
                    onClearFunnelFilter={() => setFunnelFilter(null)}
                  />
                ) : (
                  <LeadDetail
                    leads={metrics.data.leads}
                    leadCounts={metrics.data.leadCounts}
                    leadsOmitted={metrics.data.leadsOmitted}
                    filterRep={filterRep}
                    statusHint={filterRepStatusHint}
                    onClearFilter={() => { setFilterRep(null); setFilterRepStatusHint(null); }}
                    funnelFilter={funnelFilter}
                    onClearFunnelFilter={() => setFunnelFilter(null)}
                  />
                )}
                <PipelineHealth />
                <SourceBreakdown />
              </>
            ) : null}
          </>
        )}

        {tab === 'handoffs' && (
          <Suspense fallback={<TabFallback />}>
            <Handoffs data={handoffs.data} loading={handoffs.loading} error={handoffs.error} />
          </Suspense>
        )}

        {tab === 'calls' && (
          <Suspense fallback={<TabFallback />}>
            <CallsPage data={callsData.data} loading={callsData.loading} error={callsData.error} />
          </Suspense>
        )}

        {tab === 'pipeline' && (
          <>
            {metrics.error && (
              <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm">
                Failed to load data: {metrics.error}
              </div>
            )}
            {metrics.loading && !metrics.data ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/40 text-sm">Loading dashboard...</p>
                </div>
              </div>
            ) : metrics.data ? (
              <Suspense fallback={<TabFallback />}>
                <PipelineHealthPage pipelineHealth={metrics.data.pipelineHealth} />
              </Suspense>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
