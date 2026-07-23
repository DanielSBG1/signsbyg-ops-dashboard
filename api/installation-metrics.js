import { getTasksInProject } from './_lib/installation/asana.js';
import { getRescheduleCounts } from './_lib/installation/rescheduleCache.js';
import { INSTALL_PROJECT_GID, FIELDS, SECTIONS, CREWS, METROS, UNREVIEWED_SECTION_GID } from './_lib/installation/constants.js';
import { getCached, setCached } from './_lib/cache.js';

const CACHE_KEY = 'installation:metrics:v3';
const CACHE_TTL = 120; // seconds

function getField(task, fieldGid) {
  return task.custom_fields?.find((f) => f.gid === fieldGid);
}

function getDateField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return f?.date_value?.date || null;
}

function getEnumField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return f?.enum_value?.name || null;
}

function getMultiEnumField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return (f?.multi_enum_values || []).map((v) => v.name);
}

function getNumberField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return f?.number_value ?? null;
}

function getTextField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return f?.text_value || f?.display_value || null;
}

/**
 * Classify task using reschedule history.
 *
 * Completion outcomes (requires Install Date was set):
 *   - early        — completed before Install Date, 0 reschedules
 *   - on_time      — completed on Install Date, 0 reschedules
 *   - rescheduled  — completed (any date), 1 reschedule (yellow flag)
 *   - failed       — completed, 2+ reschedules (red flag — "we failed bad")
 *   - bled_over    — completed after Install Date, 0 reschedules (no
 *                    reschedule but ran late anyway — bleed-over)
 *
 * Open outcomes:
 *   - pending      — no Install Date set
 *   - scheduled    — Install Date in future, no reschedules
 *   - at_risk      — Install Date in future but already rescheduled 1+
 *   - late         — past Install Date, not completed
 */
function classifyTask(task, installDate, rescheduleCount, todayISO) {
  const completed = task.completed;
  const completedAt = task.completed_at?.split('T')[0];

  if (completed) {
    if (!installDate) return 'failed'; // completed but never had a date — bad
    if (rescheduleCount >= 2) return 'failed';
    if (rescheduleCount === 1) return 'rescheduled';
    // 0 reschedules:
    if (completedAt < installDate) return 'early';
    if (completedAt === installDate) return 'on_time';
    return 'bled_over';
  }

  if (!installDate) return 'pending';
  if (installDate < todayISO) return 'late';
  if (rescheduleCount >= 1) return 'at_risk';
  return 'scheduled';
}

// ─── Date range helpers ───────────────────────────────────────

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildScheduleStats(jobs, range, today) {
  // Use overlap: job is "in range" if its date span intersects [range.start, range.end].
  // For single-day jobs (no startDate): installDate must be within range.
  // For multi-day jobs (startDate set): the span [startDate, installDate] must overlap the range.
  const inRange = jobs.filter((j) => {
    if (!j.installDate) return false;
    const spanStart = j.startDate || j.installDate;
    return spanStart <= range.end && j.installDate >= range.start;
  });
  const completed = inRange.filter((j) => j.completed);
  const open = inRange.filter((j) => !j.completed);
  const onTime = completed.filter((j) => j.status === 'early' || j.status === 'on_time').length;
  const late = completed.filter((j) => j.status === 'failed').length + open.filter((j) => j.installDate < today).length;
  const inProgress = open.filter((j) => j.installDate >= today).length;

  const jobRows = inRange.map((j) => {
    let state;
    if (j.completed) state = (j.status === 'early' || j.status === 'on_time') ? 'on_time' : 'late';
    else state = j.installDate < today ? 'overdue' : 'in_progress';
    return { id: j.id, name: j.name, installDate: j.installDate, crews: j.crews, state, url: j.url };
  }).sort((a, b) => (a.installDate < b.installDate ? -1 : 1));

  return { scheduled: inRange.length, onTime, late, inProgress, jobs: jobRows };
}

// ─── Main handler ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  try {
    const includeJobs = req.query.include === 'jobs';
    const effectiveCacheKey = includeJobs ? `${CACHE_KEY}:full` : CACHE_KEY;

    const hit = await getCached(effectiveCacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${effectiveCacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${effectiveCacheKey}`);

    // Only fetch tasks completed in the last 90 days (+ all open tasks).
    // This avoids pulling years of old completed tasks on every refresh.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const tasks = await getTasksInProject(INSTALL_PROJECT_GID, { completed_since: ninetyDaysAgo });
    const today = new Date().toISOString().split('T')[0];

    // Fetch reschedule counts (cached — slow first time, fast after)
    const rescheduleCounts = await getRescheduleCounts(tasks);

    const enriched = tasks.map((t) => {
      const section = t.memberships?.[0]?.section;
      const installDate = getDateField(t, FIELDS.INSTALL_DATE);
      const reschedules = rescheduleCounts[t.gid] ?? 0;
      return {
        id: t.gid,
        name: t.name,
        completed: t.completed,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        modifiedAt: t.modified_at,
        url: t.permalink_url,
        sectionGid: section?.gid,
        sectionName: section?.name,
        installDate,
        due_on: t.due_on || null,
        startDate: t.start_on || null,
        surveyDate: getDateField(t, FIELDS.SURVEY_DATE),
        serviceDate: getDateField(t, FIELDS.SERVICE_DATE),
        promisedDate: getDateField(t, FIELDS.PROMISED_DATE),
        estimatedTime: getNumberField(t, FIELDS.ESTIMATED_TIME),
        crews: getMultiEnumField(t, FIELDS.TEAM),
        metro: getEnumField(t, FIELDS.METRO),
        scope: getEnumField(t, FIELDS.SCOPE),
        pm: getEnumField(t, FIELDS.PM),
        address: getTextField(t, FIELDS.STREET_ADDRESS),
        contactName: getTextField(t, FIELDS.CONTACT_NAME),
        contactPhone: getTextField(t, FIELDS.CONTACT_PHONE),
        contactEmail: getTextField(t, FIELDS.CONTACT_EMAIL),
        surveyRequired: getEnumField(t, FIELDS.SURVEY_REQUIRED),
        depositPaid: FIELDS.DEPOSIT_PAID ? getEnumField(t, FIELDS.DEPOSIT_PAID) : null,
        reschedules,
        status: classifyTask(t, installDate, reschedules, today),
      };
    });

    // --- Summary ---
    const countBy = (status) => enriched.filter((t) => t.status === status).length;

    const summary = {
      total: enriched.length,
      open: enriched.filter((t) => !t.completed).length,
      completed: enriched.filter((t) => t.completed).length,
      // open breakdown
      scheduled: countBy('scheduled'),
      atRisk: countBy('at_risk'),
      pending: countBy('pending'),
      late: countBy('late'),
      // completed breakdown
      early: countBy('early'),
      onTime: countBy('on_time'),
      bledOver: countBy('bled_over'),
      rescheduled: countBy('rescheduled'),
      failed: countBy('failed'),
      // reschedule stats
      rescheduledOnce: enriched.filter((t) => t.reschedules === 1).length,
      rescheduledMulti: enriched.filter((t) => t.reschedules >= 2).length,
    };

    // On-time rate: of completed tasks, how many hit the first accepted date?
    const totalCompleted = summary.completed;
    summary.onTimeRate = totalCompleted > 0
      ? Math.round(((summary.early + summary.onTime) / totalCompleted) * 100)
      : 0;

    // --- Unreviewed intake health ---
    const nowMs = Date.now();
    const unreviewedTasks = enriched.filter(
      (t) => t.sectionGid === UNREVIEWED_SECTION_GID && !t.completed
    );
    const ages = unreviewedTasks.map((t) => {
      const createdMs = new Date(t.createdAt).getTime();
      return { id: t.id, name: t.name, ageHours: (nowMs - createdMs) / (60 * 60 * 1000), createdAt: t.createdAt };
    });
    const staleCount = ages.filter((a) => a.ageHours > 24).length;
    const freshCount = ages.length - staleCount;
    const avgAgeHours = ages.length > 0
      ? Math.round((ages.reduce((s, a) => s + a.ageHours, 0) / ages.length) * 10) / 10
      : 0;
    const maxAgeHours = ages.length > 0
      ? Math.round(Math.max(...ages.map((a) => a.ageHours)) * 10) / 10
      : 0;
    const intakeScore = ages.length > 0
      ? Math.round((freshCount / ages.length) * 100)
      : 100;

    summary.unreviewed = {
      count: ages.length,
      fresh: freshCount,
      stale: staleCount,
      avgAgeHours,
      maxAgeHours,
      score: intakeScore,
    };

    // --- By section ---
    const bySection = SECTIONS.map((s) => ({
      ...s,
      count: enriched.filter((t) => t.sectionGid === s.gid && !t.completed).length,
    }));

    // --- By crew (shows reschedule stats per crew) ---
    const byCrew = CREWS.map((c) => {
      const crewTasks = enriched.filter((t) => t.crews.includes(c.name));
      const completedTasks = crewTasks.filter((t) => t.completed);
      const crewCompleted = completedTasks.length;
      const hit = completedTasks.filter((t) => t.status === 'early' || t.status === 'on_time').length;
      const rescheduled = completedTasks.filter((t) => t.status === 'rescheduled').length;
      const failed = completedTasks.filter((t) => t.status === 'failed').length;
      return {
        name: c.name,
        color: c.color,
        total: crewTasks.length,
        open: crewTasks.filter((t) => !t.completed).length,
        completed: crewCompleted,
        onTime: hit,
        rescheduled,
        failed,
        onTimeRate: crewCompleted > 0 ? Math.round((hit / crewCompleted) * 100) : 0,
      };
    }).filter((c) => c.total > 0);

    // --- By metro ---
    const byMetro = METROS.map((m) => ({
      name: m.name,
      count: enriched.filter((t) => t.metro === m.name && !t.completed).length,
    })).filter((m) => m.count > 0);

    // --- Jobs list (slim, includes reschedule count and sectionGid) ---
    const jobs = enriched.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      completed: t.completed,
      sectionGid: t.sectionGid,
      section: t.sectionName,
      createdAt: t.createdAt,
      installDate: t.installDate,
      nativeDueOn: t.due_on || null,
      startDate: t.startDate,
      surveyDate: t.surveyDate,
      serviceDate: t.serviceDate,
      promisedDate: t.promisedDate,
      completedAt: t.completedAt,
      reschedules: t.reschedules,
      rescheduleCount: t.reschedules,
      crews: t.crews,
      metro: t.metro,
      scope: t.scope,
      pm: t.pm,
      address: t.address,
      contactName: t.contactName,
      contactPhone: t.contactPhone,
      contactEmail: t.contactEmail,
      surveyRequired: t.surveyRequired,
      depositPaid: t.depositPaid,
      url: t.url,
    }));

    // --- Schedule (this week / last week / month to date) ---
    const thisMonday   = getMondayOf(today);
    const thisSunday   = addDays(thisMonday, 6);
    const lastMonday   = addDays(thisMonday, -7);
    const lastSunday   = addDays(thisMonday, -1);
    const monthStart   = today.slice(0, 8) + '01';

    const allForSchedule = enriched; // include completed jobs

    const thisWeekStats  = buildScheduleStats(allForSchedule, { start: thisMonday,  end: thisSunday  }, today);
    const lastWeekStats  = buildScheduleStats(allForSchedule, { start: lastMonday,  end: lastSunday  }, today);
    const monthToDate    = buildScheduleStats(allForSchedule, { start: monthStart,  end: today       }, today);

    // Crew breakdown for this week's jobs — all crews with at least one job
    const thisWeekCrews = CREWS
      .map((crew) => ({
        name: crew.name,
        color: crew.color,
        jobs: thisWeekStats.jobs.filter((j) => j.crews?.includes(crew.name)),
      }))
      .filter((c) => c.jobs.length > 0);

    const schedule = {
      thisWeek:   { ...thisWeekStats, crews: thisWeekCrews },
      lastWeek:   lastWeekStats,
      monthToDate,
    };

    const result = {
      summary,
      bySection,
      byCrew,
      byMetro,
      schedule,
      jobs: includeJobs ? jobs : [],
      jobsOmitted: !includeJobs,
      meta: {
        sections: SECTIONS,
        crews: CREWS,
      },
      refreshedAt: new Date().toISOString(),
    };
    await setCached(effectiveCacheKey, result, CACHE_TTL);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Installation metrics error:', err);
    return res.status(500).json({ error: err.message });
  }
}
