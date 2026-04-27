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

export async function getTaskStories(taskGid) {
  const qs = new URLSearchParams();
  qs.set('limit', '100');
  qs.set('opt_fields', 'type,resource_subtype,text,html_text,created_at,created_by.name,new_date_value.value,old_date_value.value,new_value,old_value,custom_field.gid,custom_field.name');

  const res = await rateLimitedFetch(`${BASE}/tasks/${taskGid}/stories?${qs.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}
