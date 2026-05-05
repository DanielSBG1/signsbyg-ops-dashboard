// Asana API client with rate limiting
const BASE = 'https://app.asana.com/api/1.0';

let lastCall = 0;
const MIN_GAP = 150;

async function rateLimitedFetch(url, options = {}, retries = 3) {
  const now = Date.now();
  const wait = MIN_GAP - (now - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.ASANA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 429 && retries > 0) {
    const backoff = (4 - retries) * 2000;
    console.warn(`Asana 429, backing off ${backoff}ms`);
    await new Promise((r) => setTimeout(r, backoff));
    lastCall = Date.now();
    return rateLimitedFetch(url, options, retries - 1);
  }
  return res;
}

export async function getTasksInProject(projectGid, opts = {}) {
  const { completed_since, opt_fields } = opts;
  const fields = opt_fields || [
    'name', 'completed', 'completed_at', 'created_at', 'modified_at',
    'memberships.section.name', 'memberships.section.gid',
    'custom_fields.gid', 'custom_fields.name', 'custom_fields.display_value',
    'custom_fields.enum_value.name', 'custom_fields.enum_value.gid',
    'custom_fields.multi_enum_values.name', 'custom_fields.multi_enum_values.gid',
    'custom_fields.date_value.date', 'custom_fields.number_value',
    'custom_fields.text_value',
    'assignee.name', 'permalink_url',
  ].join(',');

  const all = [];
  let offset;
  do {
    const qs = new URLSearchParams();
    qs.set('project', projectGid);
    qs.set('limit', '100');
    qs.set('opt_fields', fields);
    if (completed_since) qs.set('completed_since', completed_since);
    if (offset) qs.set('offset', offset);

    const res = await rateLimitedFetch(`${BASE}/tasks?${qs.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asana tasks fetch failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    all.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);

  return all;
}

export async function updateTaskInstallDate(taskGid, dateISO) {
  // dateISO: 'YYYY-MM-DD' to set, null to clear
  // Asana date custom fields require { date: "YYYY-MM-DD" } object format.
  // Asana tasks use PUT (not PATCH) — PATCH returns "No matching route".
  const dateValue = dateISO ? { date: dateISO } : null;
  const res = await rateLimitedFetch(`${BASE}/tasks/${taskGid}`, {
    method: 'PUT',
    body: JSON.stringify({
      data: {
        custom_fields: {
          '1209324069252516': dateValue, // FIELDS.INSTALL_DATE
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana update failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function getTaskStories(taskGid) {
  const qs = new URLSearchParams();
  qs.set('limit', '100');
  // opt_fields: only what's needed for reschedule detection
  // old/new_date_value sub-fields use .due_on (not .value)
  qs.set('opt_fields', 'resource_subtype,created_at,custom_field.gid,old_date_value.due_on,new_date_value.due_on');

  const res = await rateLimitedFetch(`${BASE}/tasks/${taskGid}/stories?${qs.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}
