/**
 * v2/installation-metrics — reads from Supabase instead of Asana API.
 *
 * Same response shape as v1. Replaces Asana API + KV reschedule cache
 * with 2 Supabase queries. Expected response time: <200ms.
 */
import supabase from '../_lib/supabase.js';
import { getCached, setCached } from '../_lib/cache.js';
import {
  INSTALL_PROJECT_GID, FIELDS, SECTIONS, CREWS, METROS, UNREVIEWED_SECTION_GID,
} from '../_lib/installation/constants.js';

const CACHE_KEY = 'installation:metrics:v3:sb';
const CACHE_TTL = 60;

// ── Custom field extraction (works on JSONB custom_fields array) ──

function getField(task, fieldGid) {
  const cf = Array.isArray(task.custom_fields) ? task.custom_fields : [];
  return cf.find(f => f.gid === fieldGid);
}
function getDateField(task, fieldGid) {
  return getField(task, fieldGid)?.date_value?.date || null;
}
function getEnumField(task, fieldGid) {
  return getField(task, fieldGid)?.enum_value?.name || null;
}
function getMultiEnumField(task, fieldGid) {
  return (getField(task, fieldGid)?.multi_enum_values || []).map(v => v.name);
}
function getNumberField(task, fieldGid) {
  return getField(task, fieldGid)?.number_value ?? null;
}
function getTextField(task, fieldGid) {
  const f = getField(task, fieldGid);
  return f?.text_value || f?.display_value || null;
}

// ── Classification ──

function classifyTask(task, installDate, rescheduleCount, todayISO) {
  const completed = task.completed;
  const completedAt = task.completed_at?.split('T')[0];

  if (completed) {
    if (!installDate) return 'failed';
    if (rescheduleCount >= 2) return 'failed';
    if (rescheduleCount === 1) return 'rescheduled';
    if (completedAt < installDate) return 'early';
    if (completedAt === installDate) return 'on_time';
    return 'bled_over';
  }
  if (!installDate) return 'pending';
  if (installDate < todayISO) return 'late';
  if (rescheduleCount >= 1) return 'at_risk';
  return 'scheduled';
}

// ── Reschedule analysis from Supabase stories ──

const INSTALL_DATE_GID = FIELDS.INSTALL_DATE;

function analyzeReschedules(stories) {
  const changes = stories
    .filter(s =>
      s.resource_subtype === 'date_custom_field_changed' &&
      s.custom_field_gid === INSTALL_DATE_GID
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (changes.length === 0) return 0;

  // Initial scheduling event
  const initial = changes.find(s => !s.old_value?.due_on && s.new_value?.due_on);
  if (!initial) return 0;

  const initTime = new Date(initial.created_at).getTime();
  let count = 0;

  for (const s of changes) {
    const oldDate = s.old_value?.due_on;
    const newDate = s.new_value?.due_on;
    if (!oldDate || !newDate) continue;

    const changeTime = new Date(s.created_at).getTime();
    // Correction window: changes within 1h of initial scheduling
    if (changeTime - initTime < 3600000) continue;

    count++;
  }

  return count;
}

// ── Date range helpers ──

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
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
  const inRange = jobs.filter(j => {
    if (!j.installDate) return false;
    const spanStart = j.startDate || j.installDate;
    return spanStart <= range.end && j.installDate >= range.start;
  });
  const completed = inRange.filter(j => j.completed);
  const open = inRange.filter(j => !j.completed);
  const onTime = completed.filter(j => j.status === 'early' || j.status === 'on_time').length;
  const late = completed.filter(j => j.status === 'failed').length + open.filter(j => j.installDate < today).length;
  const inProgress = open.filter(j => j.installDate >= today).length;

  const jobRows = inRange.map(j => {
    let state;
    if (j.completed) state = (j.status === 'early' || j.status === 'on_time') ? 'on_time' : 'late';
    else state = j.installDate < today ? 'overdue' : 'in_progress';
    return { id: j.id, name: j.name, installDate: j.installDate, crews: j.crews, state, url: j.url };
  }).sort((a, b) => (a.installDate < b.installDate ? -1 : 1));

  return { scheduled: inRange.length, onTime, late, inProgress, jobs: jobRows };
}

// ── Main handler ──

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  try {
    const includeJobs = req.query.include === 'jobs';
    const effectiveCacheKey = includeJobs ? `${CACHE_KEY}:full` : CACHE_KEY;

    const hit = await getCached(effectiveCacheKey);
    if (hit) return res.status(200).json(hit);

    // ── Fetch from Supabase ──
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    // Get incomplete tasks + recently completed tasks from installation project
    const [incompleteRes, completedRes] = await Promise.all([
      supabase
        .from('asana_tasks')
        .select('*')
        .eq('project_gid', INSTALL_PROJECT_GID)
        .eq('completed', false),
      supabase
        .from('asana_tasks')
        .select('*')
        .eq('project_gid', INSTALL_PROJECT_GID)
        .eq('completed', true)
        .gte('completed_at', ninetyDaysAgo),
    ]);

    if (incompleteRes.error) throw new Error(`Supabase: ${incompleteRes.error.message}`);
    if (completedRes.error) throw new Error(`Supabase: ${completedRes.error.message}`);

    const tasks = [...(incompleteRes.data || []), ...(completedRes.data || [])];
    const taskGids = tasks.map(t => t.gid);

    // Fetch reschedule stories in bulk
    const { data: allStories } = taskGids.length > 0
      ? await supabase
          .from('asana_stories')
          .select('task_gid, resource_subtype, created_at, custom_field_gid, old_value, new_value')
          .in('task_gid', taskGids)
          .eq('resource_subtype', 'date_custom_field_changed')
      : { data: [] };

    // Group stories by task
    const storyMap = {};
    for (const s of allStories || []) {
      if (!storyMap[s.task_gid]) storyMap[s.task_gid] = [];
      storyMap[s.task_gid].push(s);
    }

    const today = new Date().toISOString().split('T')[0];
    const nowMs = Date.now();

    const enriched = tasks.map(t => {
      const sectionGid = t.section_gid;
      const sectionName = t.section_name;
      const installDate = getDateField(t, FIELDS.INSTALL_DATE);
      const reschedules = analyzeReschedules(storyMap[t.gid] || []);

      return {
        id: t.gid,
        name: t.name,
        completed: t.completed,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        modifiedAt: t.modified_at,
        url: t.permalink_url,
        sectionGid,
        sectionName,
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
    const countBy = (status) => enriched.filter(t => t.status === status).length;
    const summary = {
      total: enriched.length,
      open: enriched.filter(t => !t.completed).length,
      completed: enriched.filter(t => t.completed).length,
      scheduled: countBy('scheduled'),
      atRisk: countBy('at_risk'),
      pending: countBy('pending'),
      late: countBy('late'),
      early: countBy('early'),
      onTime: countBy('on_time'),
      bledOver: countBy('bled_over'),
      rescheduled: countBy('rescheduled'),
      failed: countBy('failed'),
      rescheduledOnce: enriched.filter(t => t.reschedules === 1).length,
      rescheduledMulti: enriched.filter(t => t.reschedules >= 2).length,
    };

    const totalCompleted = summary.completed;
    summary.onTimeRate = totalCompleted > 0
      ? Math.round(((summary.early + summary.onTime) / totalCompleted) * 100) : 0;

    // --- Unreviewed intake health ---
    const unreviewedTasks = enriched.filter(t => t.sectionGid === UNREVIEWED_SECTION_GID && !t.completed);
    const ages = unreviewedTasks.map(t => ({
      id: t.id, name: t.name,
      ageHours: (nowMs - new Date(t.createdAt).getTime()) / 3600000,
      createdAt: t.createdAt,
    }));
    const staleCount = ages.filter(a => a.ageHours > 24).length;
    const freshCount = ages.length - staleCount;
    summary.unreviewed = {
      count: ages.length,
      fresh: freshCount,
      stale: staleCount,
      avgAgeHours: ages.length > 0
        ? Math.round((ages.reduce((s, a) => s + a.ageHours, 0) / ages.length) * 10) / 10 : 0,
      maxAgeHours: ages.length > 0
        ? Math.round(Math.max(...ages.map(a => a.ageHours)) * 10) / 10 : 0,
      score: ages.length > 0 ? Math.round((freshCount / ages.length) * 100) : 100,
    };

    // --- By section ---
    const bySection = SECTIONS.map(s => ({
      ...s,
      count: enriched.filter(t => t.sectionGid === s.gid && !t.completed).length,
    }));

    // --- By crew ---
    const byCrew = CREWS.map(c => {
      const crewTasks = enriched.filter(t => t.crews.includes(c.name));
      const completedTasks = crewTasks.filter(t => t.completed);
      const hit = completedTasks.filter(t => t.status === 'early' || t.status === 'on_time').length;
      return {
        name: c.name, color: c.color,
        total: crewTasks.length,
        open: crewTasks.filter(t => !t.completed).length,
        completed: completedTasks.length,
        onTime: hit,
        rescheduled: completedTasks.filter(t => t.status === 'rescheduled').length,
        failed: completedTasks.filter(t => t.status === 'failed').length,
        onTimeRate: completedTasks.length > 0 ? Math.round((hit / completedTasks.length) * 100) : 0,
      };
    }).filter(c => c.total > 0);

    // --- By metro ---
    const byMetro = METROS.map(m => ({
      name: m.name,
      count: enriched.filter(t => t.metro === m.name && !t.completed).length,
    })).filter(m => m.count > 0);

    // --- Jobs list ---
    const jobs = enriched.map(t => ({
      id: t.id, name: t.name, status: t.status, completed: t.completed,
      sectionGid: t.sectionGid, section: t.sectionName,
      createdAt: t.createdAt, installDate: t.installDate,
      nativeDueOn: t.due_on || null, startDate: t.startDate,
      surveyDate: t.surveyDate, serviceDate: t.serviceDate,
      promisedDate: t.promisedDate, completedAt: t.completedAt,
      reschedules: t.reschedules, rescheduleCount: t.reschedules,
      crews: t.crews, metro: t.metro, scope: t.scope, pm: t.pm,
      address: t.address, contactName: t.contactName,
      contactPhone: t.contactPhone, contactEmail: t.contactEmail,
      surveyRequired: t.surveyRequired, depositPaid: t.depositPaid,
      url: t.url,
    }));

    // --- Schedule ---
    const thisMonday = getMondayOf(today);
    const thisSunday = addDays(thisMonday, 6);
    const lastMonday = addDays(thisMonday, -7);
    const lastSunday = addDays(thisMonday, -1);
    const monthStart = today.slice(0, 8) + '01';

    const thisWeekStats = buildScheduleStats(enriched, { start: thisMonday, end: thisSunday }, today);
    const lastWeekStats = buildScheduleStats(enriched, { start: lastMonday, end: lastSunday }, today);
    const monthToDate = buildScheduleStats(enriched, { start: monthStart, end: today }, today);

    const thisWeekCrews = CREWS
      .map(crew => ({
        name: crew.name, color: crew.color,
        jobs: thisWeekStats.jobs.filter(j => j.crews?.includes(crew.name)),
      }))
      .filter(c => c.jobs.length > 0);

    const result = {
      summary, bySection, byCrew, byMetro,
      schedule: {
        thisWeek: { ...thisWeekStats, crews: thisWeekCrews },
        lastWeek: lastWeekStats,
        monthToDate,
      },
      jobs: includeJobs ? jobs : [],
      jobsOmitted: !includeJobs,
      meta: { sections: SECTIONS, crews: CREWS },
      refreshedAt: new Date().toISOString(),
    };

    await setCached(effectiveCacheKey, result, CACHE_TTL);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[v2/installation-metrics]', err);
    return res.status(500).json({ error: err.message });
  }
}
