import { searchAllCRM, getOwners } from './_lib/sales/hubspot.js';
import { getCached, setCached } from './_lib/cache.js';
import { getDateRange } from './_lib/sales/periods.js';

const CACHE_TTL = 300;
// These periods show current open-task state; everything else shows historical completions
const CURRENT_PERIODS = new Set(['today', 'week']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    const { period = 'today', customStart, customEnd } = req.query;
    const mode = CURRENT_PERIODS.has(period) ? 'current' : 'historical';
    const CACHE_KEY = `repactivityv5:${period}:${customStart || ''}:${customEnd || ''}`;

    const hit = await getCached(CACHE_KEY);
    if (hit) { console.log(`[Cache HIT] ${CACHE_KEY}`); return res.status(200).json(hit); }
    console.log(`[Cache MISS] ${CACHE_KEY} mode=${mode}`);

    const range = getDateRange(period, customStart, customEnd);
    const nowMs = Date.now();

    // In current mode, meetings always use the full current week (not just "today")
    // so the meeting count reflects the rep's week, not a single day.
    const meetingRange = mode === 'current' ? getDateRange('week') : range;
    const meetingStartMs = String(new Date(meetingRange.start).getTime());
    const meetingEndMs   = String(new Date(meetingRange.end).getTime());

    // Today boundaries (UTC server time) — for overdue / due-today bucketing
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let tasksFetch;

    if (mode === 'current') {
      // All open tasks regardless of date
      tasksFetch = searchAllCRM('tasks', {
        filterGroups: [
          { filters: [{ propertyName: 'hs_task_status', operator: 'EQ', value: 'NOT_STARTED' }] },
          { filters: [{ propertyName: 'hs_task_status', operator: 'EQ', value: 'IN_PROGRESS' }] },
        ],
        properties: ['hs_task_status', 'hs_task_subject', 'hubspot_owner_id', 'hs_timestamp'],
      }).catch(() => ({ results: [] }));
    } else {
      // Tasks completed within the period (proxy: hs_lastmodifieddate falls in range)
      tasksFetch = searchAllCRM('tasks', {
        filterGroups: [
          {
            filters: [
              { propertyName: 'hs_task_status', operator: 'EQ', value: 'COMPLETED' },
              { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: range.start },
              { propertyName: 'hs_lastmodifieddate', operator: 'LTE', value: range.end },
            ],
          },
        ],
        properties: ['hs_task_status', 'hs_task_subject', 'hubspot_owner_id', 'hs_timestamp', 'hs_lastmodifieddate'],
      }).catch(() => ({ results: [] }));
    }

    const meetingsFetch = searchAllCRM('meetings', {
      filters: [
        { propertyName: 'hs_meeting_start_time', operator: 'GTE', value: meetingStartMs },
        { propertyName: 'hs_meeting_start_time', operator: 'LTE', value: meetingEndMs },
      ],
      properties: ['hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_outcome', 'hubspot_owner_id'],
    }).catch(() => ({ results: [] }));

    // Fetch owner names so the component doesn't depend on the period-filtered metrics reps list
    const ownersFetch = getOwners().catch(() => []);

    const [tasksData, meetingsData, ownersRaw] = await Promise.all([tasksFetch, meetingsFetch, ownersFetch]);

    // Build id → display name map
    const ownerNames = {};
    for (const o of ownersRaw) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email || o.id;
      ownerNames[String(o.id)] = name;
    }

    const byOwner = {};
    function getOwnerBucket(id) {
      if (!byOwner[id]) byOwner[id] = { tasks: [], meetingsBooked: 0, meetingsAttended: 0, meetings: [] };
      return byOwner[id];
    }

    for (const task of tasksData.results) {
      const id = task.properties.hubspot_owner_id;
      if (!id) continue;
      const o = getOwnerBucket(id);
      const dueRaw = task.properties.hs_timestamp;
      const dueMs = dueRaw ? new Date(dueRaw).getTime() : null;

      if (mode === 'current') {
        const isOverdue  = !!(dueMs && dueMs < todayStart.getTime());
        const isDueToday = !!(dueMs && dueMs >= todayStart.getTime() && dueMs <= todayEnd.getTime());
        o.tasks.push({
          id: task.id,
          subject: task.properties.hs_task_subject || '(no subject)',
          dueDate: dueRaw || null,
          isOverdue,
          isDueToday,
        });
      } else {
        const completedRaw = task.properties.hs_lastmodifieddate;
        const completedMs  = completedRaw ? new Date(completedRaw).getTime() : null;
        const isLate = !!(dueMs && completedMs && completedMs > dueMs);
        o.tasks.push({
          id: task.id,
          subject: task.properties.hs_task_subject || '(no subject)',
          dueDate: dueRaw || null,
          completedDate: completedRaw || null,
          isLate,
        });
      }
    }

    for (const m of meetingsData.results) {
      const id = m.properties.hubspot_owner_id;
      if (!id) continue;
      const o = getOwnerBucket(id);
      o.meetingsBooked++;
      const outcome  = m.properties.hs_meeting_outcome;
      const startRaw = m.properties.hs_meeting_start_time;
      const startMs  = startRaw ? new Date(startRaw).getTime() : null;
      const wentThrough =
        outcome === 'COMPLETED' ||
        (startMs && startMs < nowMs && outcome !== 'CANCELED' && outcome !== 'NO_SHOW' && outcome !== 'RESCHEDULED');
      if (wentThrough) o.meetingsAttended++;
      o.meetings.push({
        id: m.id,
        title: m.properties.hs_meeting_title || '(no title)',
        startTime: startRaw || null,
        outcome: outcome || null,
        wentThrough: !!wentThrough,
      });
    }

    const summary = {};
    for (const [ownerId, data] of Object.entries(byOwner)) {
      if (mode === 'current') {
        summary[ownerId] = {
          openTasks:     data.tasks.length,
          overdueTasks:  data.tasks.filter((t) => t.isOverdue).length,
          dueTodayTasks: data.tasks.filter((t) => t.isDueToday).length,
          tasks: data.tasks,
          meetingsBooked:   data.meetingsBooked,
          meetingsAttended: data.meetingsAttended,
          meetings: data.meetings,
        };
      } else {
        summary[ownerId] = {
          completedTasks: data.tasks.length,
          lateTasks:      data.tasks.filter((t) => t.isLate).length,
          tasks: data.tasks,
          meetingsBooked:   data.meetingsBooked,
          meetingsAttended: data.meetingsAttended,
          meetings: data.meetings,
        };
      }
    }

    const result = {
      mode,
      periodLabel: range.label,
      owners: ownerNames,   // id → display name, so component is independent of metrics reps list
      byOwner: summary,
      generatedAt: new Date().toISOString(),
    };
    await setCached(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json(result);
  } catch (err) {
    console.error('RepActivity API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
