const ASANA_BASE = 'https://app.asana.com/api/1.0';
const MAX_RETRIES = 3;

/**
 * Makes a single GET request to the Asana API.
 * Returns parsed response data array.
 */
async function asanaGet(path, params = {}, attempt = 0) {
  const url = new URL(`${ASANA_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.ASANA_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
    const wait = retryAfter * Math.pow(2, attempt) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return asanaGet(path, params, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Asana API ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Fetches all pages from an Asana collection endpoint.
 * Handles pagination automatically (Asana max 100 per page).
 */
async function asanaGetAll(path, params = {}) {
  const results = [];
  let offset = null;

  do {
    const json = await asanaGet(path, { ...params, ...(offset ? { offset } : {}) });
    results.push(...(json.data ?? []));
    offset = json.next_page?.offset ?? null;
  } while (offset);

  return results;
}

/**
 * Returns all incomplete tasks in an Asana project.
 * completed_since=now is Asana's idiom for "incomplete tasks only".
 * @param {string} projectGid
 * @param {string} optFields  comma-separated opt_fields
 */
export async function getProjectTasks(projectGid, optFields) {
  return asanaGetAll(`/projects/${projectGid}/tasks`, {
    opt_fields: optFields,
    completed_since: 'now',
    limit: 100,
  });
}

/**
 * Returns a single task by GID.
 */
export async function getTask(taskGid, optFields) {
  const json = await asanaGet(`/tasks/${taskGid}`, { opt_fields: optFields });
  return json.data;
}

/**
 * Returns immediate subtasks of a task.
 */
export async function getSubtasks(taskGid, optFields) {
  return asanaGetAll(`/tasks/${taskGid}/subtasks`, {
    opt_fields: optFields,
    limit: 100,
  });
}

/**
 * Returns all stories (comments + system events) for a task.
 * Filter to type==='comment' to count actual comments.
 */
export async function getTaskStories(taskGid, optFields = 'type') {
  return asanaGetAll(`/tasks/${taskGid}/stories`, {
    opt_fields: optFields,
    limit: 100,
  });
}
