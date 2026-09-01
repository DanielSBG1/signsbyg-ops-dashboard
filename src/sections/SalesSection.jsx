import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { SectionSkeleton, SkeletonChart } from '../components/Skeleton';
import { useMetrics } from '../hooks/sales/useMetrics';
import { useHandoffs } from '../hooks/sales/useHandoffs';
import { useCalls } from '../hooks/sales/useCalls';
import { useRepActivity } from '../hooks/sales/useRepActivity';
import { useCohortDeals } from '../hooks/sales/useCohortDeals';
import { useRepLeads } from '../hooks/sales/useRepLeads';
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
import StageConversion from '../components/sales/StageConversion';
import DealsTimeline from '../components/sales/DealsTimeline';

const PipelineHealthPage = lazy(() => import('../components/sales/PipelineHealthPage'));
const CallsPage          = lazy(() => import('../components/sales/CallsPage'));
const Handoffs           = lazy(() => import('../components/sales/Handoffs'));
const RepScorecard       = lazy(() => import('../components/sales/RepScorecard'));

function TabFallback() {
  return <SkeletonChart />;
}

export default function SalesSection() {
  const [tab, setTab] = useState('sales');
  const [filterRep, setFilterRep] = useState(null);
  const [filterRepStatusHint, setFilterRepStatusHint] = useState(null);
  const [leaderboardSortKey, setLeaderboardSortKey] = useState('revenueClosed');
  const [funnelFilter, setFunnelFilter] = useState(null);
  const [selectedRepTab, setSelectedRepTab] = useState(null);
  const detailRef = useRef(null);

  useEffect(() => {
    if ((funnelFilter || filterRep) && detailRef.current) {
      setTimeout(() => detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [funnelFilter, filterRep]);
  const [visitedTabs, setVisitedTabs] = useState({ sales: true, pipeline: true, rep: true });

  function handleTabChange(t) {
    setTab(t);
    if (!visitedTabs[t]) setVisitedTabs(v => ({ ...v, [t]: true }));
  }

  const handleViewScorecard = (repId) => {
    handleTabChange('rep');
    setSelectedRepTab(repId);
  };

  const metricsEnabled  = visitedTabs.sales || visitedTabs.pipeline || visitedTabs.rep;
  const handoffsEnabled = visitedTabs.handoffs;
  const callsEnabled    = visitedTabs.calls;

  const metrics     = useMetrics(metricsEnabled);
  const handoffs    = useHandoffs(handoffsEnabled);
  const callsData   = useCalls(callsEnabled);
  const repActivity = useRepActivity(metricsEnabled, metrics.period, metrics.customRange);
  // Cohort deals for wide periods (month+) \u2014 fetched in parallel, never blocks render
  const cohortDealsHook = useCohortDeals(metricsEnabled, metrics.period, metrics.customRange);
  const cohortDeals = cohortDealsHook.data ?? metrics.data?.cohortDeals ?? [];

  // Rep-scoped contact fetch \u2014 only fires for wide periods (month+) when a rep is
  // selected and the leaderboard is in leads-sort mode (narrow periods already have
  // all contacts in the main metrics payload).
  const leadsMode = filterRepStatusHint === 'new_lead' || filterRepStatusHint === null;
  const repLeadsHook = useRepLeads(
    metricsEnabled && leadsMode,
    filterRep,
    metrics.period,
    metrics.customRange,
  );

  // Determine which detail panel to show:
  // - deals sort (revenue/won/conversion) + rep selected \u2192 DealDetail
  // - funnel deals/won/decided row clicked \u2192 DealDetail
  // - metric card: deals-type cards \u2192 DealDetail; leads-type cards \u2192 LeadDetail
  // - everything else \u2192 LeadDetail
  const dealsRow = funnelFilter && (funnelFilter.row === 'deals' || funnelFilter.row === 'won' || funnelFilter.row === 'decided' || funnelFilter.row === 'sent');
  const showDealDetail = dealsRow || (filterRep && filterRepStatusHint === 'qualified');

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
              <SectionSkeleton />
            ) : metrics.data ? (
              <>
                <MetricCards
                  summary={metrics.data.summary}
                  period={metrics.period}
                  activeCard={funnelFilter?.type === 'metric' ? funnelFilter.key : null}
                  onCardClick={(filter) => {
                    setFilterRep(null);
                    setFilterRepStatusHint(null);
                    setFunnelFilter((prev) => (prev?.type === 'metric' && prev?.key === filter.key ? null : filter));
                  }}
                />
                <SpeedToLead sla={metrics.data.sla} />
                <Leaderboard
                  reps={metrics.data.reps}
                  selectedRep={filterRep}
                  onRepClick={(repId, sortKey) => {
                    setLeaderboardSortKey(sortKey);
                    setFilterRep(repId);
                    if (!repId) { setFilterRepStatusHint(null); return; }
                    // null = show all statuses (leadsAssigned counts all, not just new_lead)
                    const hint = (sortKey === 'leadsAssigned' || sortKey === 'avgResponseMinutes')
                      ? null : 'qualified';
                    setFilterRepStatusHint(hint);
                  }}
                  onViewScorecard={handleViewScorecard}
                />
                {filterRep && metrics.data?.periodDeals?.length > 0 && (
                  <DealsTimeline
                    deals={metrics.data.periodDeals.filter((d) => d.ownerId === filterRep)}
                    period={metrics.period}
                    repName={metrics.data.reps?.find((r) => r.id === filterRep)?.name}
                  />
                )}
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
                <div ref={detailRef}>
                  {showDealDetail ? (
                    <DealDetail
                      cohortDeals={cohortDeals}
                      cohortLoading={cohortDealsHook.loading}
                      periodDeals={metrics.data.periodDeals}
                      dealsSentDeals={metrics.data.dealsSentDeals}
                      funnelFilter={funnelFilter}
                      repFilter={filterRepStatusHint === 'qualified' && !funnelFilter ? filterRep : null}
                      repName={filterRep ? metrics.data.reps?.find((r) => r.id === filterRep)?.name : null}
                      leaderboardSortKey={leaderboardSortKey}
                      onClearFunnelFilter={() => setFunnelFilter(null)}
                      onClearRepFilter={() => { setFilterRep(null); setFilterRepStatusHint(null); }}
                    />
                  ) : (
                    <LeadDetail
                      leads={metrics.data.leads}
                      leadCounts={metrics.data.leadCounts}
                      leadsOmitted={metrics.data.leadsOmitted}
                      repLeads={repLeadsHook.data}
                      repLeadsLoading={repLeadsHook.loading}
                      filterRep={filterRep}
                      statusHint={filterRepStatusHint}
                      onClearFilter={() => { setFilterRep(null); setFilterRepStatusHint(null); }}
                      funnelFilter={funnelFilter}
                      onClearFunnelFilter={() => setFunnelFilter(null)}
                    />
                  )}
                </div>
                <StageConversion />
                <PipelineHealth />
                <SourceBreakdown />
              </>
            ) : null}
          </>
        )}

        {tab === 'rep' && (
          <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading scorecards...</div>}>
            <RepScorecard
              reps={metrics.data?.reps}
              selectedRepId={selectedRepTab}
              onSelectRep={setSelectedRepTab}
              periodDeals={metrics.data?.periodDeals}
              period={metrics.period}
            />
          </Suspense>
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
              <SectionSkeleton />
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
