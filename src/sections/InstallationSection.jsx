import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useInstallationMetrics } from '../hooks/useInstallationMetrics';
import { getPeriodRange } from '../lib/period';
import { filterJobs, computeSummary, computeBySection, computeByCrew, computeUnassigned } from '../lib/aggregate';
import InstallationOverview from '../components/installation/InstallationOverview';
import CalendarView from '../components/installation/CalendarView';
import PeriodSelector from '../components/installation/PeriodSelector';
import SummaryCards from '../components/installation/SummaryCards';
import SectionPipeline from '../components/installation/SectionPipeline';
import CrewScorecard from '../components/installation/CrewScorecard';
import StatusLegend from '../components/installation/StatusLegend';
import SectionJobsModal from '../components/installation/SectionJobsModal';
import TrucksTab from '../components/installation/TrucksTab';

const InstallerScorecard = lazy(() => import('../components/installation/InstallerScorecard'));

const TABS = [
  { id: 'overview',   label: 'Overview'    },
  { id: 'installers', label: 'Installers'  },
  { id: 'calendar',   label: 'Calendar'    },
  { id: 'trucks',     label: 'Trucks'      },
];

export default function InstallationSection() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('live');
  const [openSection, setOpenSection] = useState(null);
  const { data, loading, error, lastRefreshed, refresh } = useInstallationMetrics();

  const range = useMemo(() => getPeriodRange(period), [period]);

  // Client-side re-aggregation when period changes — avoids a server round-trip
  const view = useMemo(() => {
    if (!data) return null;
    const filteredJobs = filterJobs(data.jobs, range);
    const sections = data.meta?.sections
      || (data.bySection || []).map((s) => ({ gid: s.gid, name: s.name }));
    const crews = data.meta?.crews
      || (data.byCrew || []).map((c) => ({ name: c.name, color: c.color }));
    return {
      jobs: filteredJobs,
      summary: computeSummary(filteredJobs),
      bySection: computeBySection(filteredJobs, sections),
      byCrew: computeByCrew(filteredJobs, crews),
      unassigned: computeUnassigned(filteredJobs),
    };
  }, [data, range]);

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Installation</h1>
            {lastRefreshed && (
              <p className="text-white/40 text-xs mt-1">
                Live snapshot &middot; Updated {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button onClick={refresh}
            className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors">
            Refresh
          </button>
        </div>

        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data && (
          <div className="text-center py-20 text-white/40">Loading installation data...</div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        {data && activeTab === 'overview' && (
          <>
            <PeriodSelector period={period} setPeriod={setPeriod} range={range} />
            {view && <SummaryCards summary={view.summary} />}
            <InstallationOverview data={data} />
            {view && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionPipeline bySection={view.bySection} onSectionClick={setOpenSection} />
                <CrewScorecard
                  byCrew={view.byCrew}
                  unassignedCount={view.unassigned}
                  onUnassignedClick={() => {
                    const unassignedJobs = view.jobs.filter(
                      (j) => !j.completed && (!j.crews || j.crews.length === 0)
                    );
                    setOpenSection({ gid: '_unassigned', name: 'Unassigned Jobs', openJobs: unassignedJobs });
                  }}
                />
              </div>
            )}
            {view && <StatusLegend summary={view.summary} />}
          </>
        )}

        {data && activeTab === 'installers' && (
          <Suspense fallback={<div className="text-center py-20 text-white/40">Loading installer scorecard...</div>}>
            <InstallerScorecard data={data} />
          </Suspense>
        )}

        {data && activeTab === 'calendar' && (
          <CalendarView jobs={data.jobs} byCrew={data.byCrew} onRefresh={refresh} />
        )}

        {activeTab === 'trucks' && <TrucksTab />}

        {openSection && (
          <SectionJobsModal
            section={openSection}
            jobs={openSection.openJobs || []}
            onClose={() => setOpenSection(null)}
          />
        )}
      </div>
    </div>
  );
}
