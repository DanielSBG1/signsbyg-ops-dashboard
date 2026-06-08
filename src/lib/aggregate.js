// Client-side re-aggregation of metrics when period filter changes.
// The API returns all jobs; this filters and recomputes on the fly.

import { inRange, todayISO } from './period.js';
import { getSectionJobState, SECTION_DATE_FIELD } from './sectionDates.js';

export function filterJobs(jobs, range) {
  if (!range.start || !range.end) return jobs;
  // For period views: job is "in period" if its Install Date is in range
  return jobs.filter((j) => inRange(j.installDate, range));
}

export function computeSummary(jobs) {
  const by = (status) => jobs.filter((j) => j.status === status).length;
  const rescOnce  = jobs.filter((j) => (j.reschedules || 0) === 1).length;
  const rescMulti = jobs.filter((j) => (j.reschedules || 0) >= 2).length;

  const completed = jobs.filter((j) => j.status === 'early' || j.status === 'on_time' ||
                                       j.status === 'rescheduled' || j.status === 'failed' ||
                                       j.status === 'bled_over').length;
  const onTimeCount = by('early') + by('on_time');

  return {
    total: jobs.length,
    open: jobs.filter((j) => !['early', 'on_time', 'rescheduled', 'failed', 'bled_over'].includes(j.status)).length,
    completed,
    scheduled: by('scheduled'),
    atRisk: by('at_risk'),
    pending: by('pending'),
    late: by('late'),
    early: by('early'),
    onTime: by('on_time'),
    bledOver: by('bled_over'),
    rescheduled: by('rescheduled'),
    failed: by('failed'),
    rescheduledOnce: rescOnce,
    rescheduledMulti: rescMulti,
    onTimeRate: completed > 0 ? Math.round((onTimeCount / completed) * 100) : 0,
  };
}

export function computeBySection(jobs, sections) {
  return sections.map((s) => {
    const sectionJobs = jobs.filter((j) => j.sectionGid === s.gid);
    // openJobs excludes tasks already completed in Asana; these are what the
    // install manager is currently working through.
    const openJobs = sectionJobs.filter((j) => !j.completed);
    const completed = sectionJobs.length - openJobs.length;

    // Per-state breakdown of OPEN jobs only.
    const states = { late: 0, today: 0, on_track: 0, missing: 0, na: 0 };
    for (const j of openJobs) {
      const state = getSectionJobState(j);
      if (state === 'completed') continue; // shouldn't happen since we filter
      states[state] = (states[state] || 0) + 1;
    }

    return {
      ...s,
      count: openJobs.length,
      openJobs,
      completed,
      dateFieldRequired: SECTION_DATE_FIELD[s.name] !== null && SECTION_DATE_FIELD[s.name] !== undefined,
      states,
    };
  });
}

export function computeUnassigned(jobs) {
  return jobs.filter((j) => !j.completed && (!j.crews || j.crews.length === 0)).length;
}

export function computeByCrew(jobs, crews) {
  return crews.map((c) => {
    const crewJobs = jobs.filter((j) => (j.crews || []).includes(c.name));
    const completedJobs = crewJobs.filter((j) => ['early', 'on_time', 'rescheduled', 'failed', 'bled_over'].includes(j.status));
    const hit = completedJobs.filter((j) => j.status === 'early' || j.status === 'on_time').length;
    const rescheduled = completedJobs.filter((j) => j.status === 'rescheduled').length;
    const failed = completedJobs.filter((j) => j.status === 'failed').length;
    return {
      name: c.name,
      color: c.color,
      total: crewJobs.length,
      open: crewJobs.length - completedJobs.length,
      completed: completedJobs.length,
      onTime: hit,
      rescheduled,
      failed,
      onTimeRate: completedJobs.length > 0 ? Math.round((hit / completedJobs.length) * 100) : 0,
    };
  }).filter((c) => c.total > 0);
}
