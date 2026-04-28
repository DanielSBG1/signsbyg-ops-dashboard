import { getTasksInProject } from './_lib/installation/asana.js';
import { INSTALL_PROJECT_GID, FIELDS, SECTIONS, CREWS, METROS } from './_lib/installation/constants.js';
import { getCached, setCached } from './_lib/cache.js';

const CACHE_KEY = 'installation:metrics:v1';
const CACHE_TTL = 120; // seconds — matches cron cadence (cron writes, users read)

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

// Classify completion status per our rules
// NOTE: rescheduled count requires story/history data — deferred for now.
// For Phase 1, we infer a task was rescheduled if modified_at > install_date + 1d
// (a heuristic). Phase 2 will use task stories for precise counts.
function classifyTask(task, todayISO) {
  const installDate = getDateField(task, FIELDS.INSTALL_DATE);
  const completed = task.completed;
  const completedAt = task.completed_at?.split('T')[0];

  if (completed && installDate) {
    if (completedAt < installDate) return 'early';
    if (completedAt === installDate) return 'on_time';
    // Completed after install date → was rescheduled or bled over
    return 'failed'; // Will refine with story data
  }

  if (!installDate) return 'pending';
  if (installDate < todayISO) return 'late';
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
  const inRange = jobs.filter((j) => j.installDate && j.installDate >= range.start && j.installDate <= range.end);
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

  const cached = await getCached(CACHE_KEY);
  if (cached) {
    console.log(`[Cache HIT] ${CACHE_KEY}`);
    return res.status(200).json(cached);
  }
  console.log(`[Cache MISS] ${CACHE_KEY}`);

  try {
    const tasks = await getTasksInProject(INSTALL_PROJECT_GID);
    const today = new Date().toISOString().split('T')[0];

    const enriched = tasks.map((t) => {
      const section = t.memberships?.[0]?.section;
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
        installDate: getDateField(t, FIELDS.INSTALL_DATE),
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
        surveyRequired: getEnumField(t, FIELDS.SURVEY_REQUIRED),
        status: classifyTask(t, today),
      };
    });

    // --- Summary ---
    const summary = {
      total: enriched.length,
      open: enriched.filter((t) => !t.completed).length,
      completed: enriched.filter((t) => t.completed).length,
      scheduled: enriched.filter((t) => t.status === 'scheduled').length,
      pending: enriched.filter((t) => t.status === 'pending').length,
      late: enriched.filter((t) => t.status === 'late').length,
      early: enriched.filter((t) => t.status === 'early').length,
      onTime: enriched.filter((t) => t.status === 'on_time').length,
      failed: enriched.filter((t) => t.status === 'failed').length,
    };

    // On-time rate (of completed)
    const totalCompleted = summary.early + summary.onTime + summary.failed;
    summary.onTimeRate = totalCompleted > 0
      ? Math.round(((summary.early + summary.onTime) / totalCompleted) * 100)
      : 0;

    // --- By section ---
    const bySection = SECTIONS.map((s) => ({
      ...s,
      count: enriched.filter((t) => t.sectionGid === s.gid && !t.completed).length,
    }));

    // --- By crew (open only) ---
    const byCrew = CREWS.map((c) => {
      const crewTasks = enriched.filter((t) => t.crews.includes(c.name));
      const completedTasks = crewTasks.filter((t) => t.completed);
      const crewCompleted = completedTasks.length;
      const crewEarly = completedTasks.filter((t) => t.status === 'early').length;
      const crewOnTime = completedTasks.filter((t) => t.status === 'on_time').length;
      return {
        name: c.name,
        color: c.color,
        total: crewTasks.length,
        open: crewTasks.filter((t) => !t.completed).length,
        completed: crewCompleted,
        onTime: crewEarly + crewOnTime,
        onTimeRate: crewCompleted > 0 ? Math.round(((crewEarly + crewOnTime) / crewCompleted) * 100) : 0,
      };
    }).filter((c) => c.total > 0);

    // --- By metro ---
    const byMetro = METROS.map((m) => ({
      name: m.name,
      count: enriched.filter((t) => t.metro === m.name && !t.completed).length,
    })).filter((m) => m.count > 0);

    // --- Jobs list (slim) ---
    const jobs = enriched.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      section: t.sectionName,
      installDate: t.installDate,
      crews: t.crews,
      metro: t.metro,
      scope: t.scope,
      pm: t.pm,
      address: t.address,
      contactName: t.contactName,
      completedAt: t.completedAt,
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

    // Crew breakdown for this week's jobs (3 main crews only)
    const MAIN_CREWS = [
      { name: 'Roberth & Jorge', color: '#ef4444' },
      { name: 'Yandy & Cesar',   color: '#06b6d4' },
      { name: 'Poli & Midiel',   color: '#22c55e' },
    ];
    const thisWeekCrews = MAIN_CREWS.map((crew) => ({
      ...crew,
      jobs: thisWeekStats.jobs.filter((j) => j.crews?.includes(crew.name)),
    }));

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
      jobs,
      refreshedAt: new Date().toISOString(),
    };
    await setCached(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Installation metrics error:', err);
    return res.status(500).json({ error: err.message });
  }
}
