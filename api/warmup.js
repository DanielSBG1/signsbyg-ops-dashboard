/**
 * Tiered cache warmup — keeps KV/CDN hot so user requests hit cache.
 *
 * ALL tiers now use v2 Supabase endpoints (except sales-rep-activity which stays v1).
 */

async function fetchInternal(host, path) {
  const url = `https://${host}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  const tier = req.query.tier ?? 'hot';
  const host = req.headers.host;

  let results;

  if (tier === 'hot') {
    const settled = await Promise.allSettled([
      // v2 Supabase endpoints
      fetchInternal(host, '/api/v2/pm-metrics'),
      fetchInternal(host, '/api/v2/pm-audit'),
      fetchInternal(host, '/api/v2/production-metrics'),
      fetchInternal(host, '/api/v2/production-throughput'),
      fetchInternal(host, '/api/v2/installation-metrics'),
      fetchInternal(host, '/api/v2/daily-leads?period=today'),
      // v2 Sales
      fetchInternal(host, '/api/v2/sales-metrics?period=today'),
      fetchInternal(host, '/api/v2/sales-metrics?period=week'),
      fetchInternal(host, '/api/v2/sales-pipeline'),
      fetchInternal(host, '/api/v2/sales-calls?period=today'),
    ]);

    results = {
      'v2/pm-metrics':           settled[0].status,
      'v2/pm-audit':             settled[1].status,
      'v2/production-metrics':   settled[2].status,
      'v2/production-throughput': settled[3].status,
      'v2/installation-metrics': settled[4].status,
      'v2/daily-leads':          settled[5].status,
      'v2/sales-metrics:today':  settled[6].status,
      'v2/sales-metrics:week':   settled[7].status,
      'v2/sales-pipeline':       settled[8].status,
      'v2/sales-calls':          settled[9].status,
    };

  } else if (tier === 'warm') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/v2/sales-metrics?period=month'),
      fetchInternal(host, '/api/v2/sales-metrics?period=quarter'),
      fetchInternal(host, '/api/v2/sales-sources?period=month'),
      fetchInternal(host, '/api/v2/sales-stage-conversion?mode=snapshot'),
      fetchInternal(host, '/api/v2/sales-stage-conversion?mode=cohort&period=month'),
      fetchInternal(host, '/api/v2/sales-handoffs?period=month'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=month'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=quarter'),
    ]);

    results = {
      'v2/sales-metrics:month':    settled[0].status,
      'v2/sales-metrics:quarter':  settled[1].status,
      'v2/sales-sources:month':    settled[2].status,
      'v2/stage-conv:snapshot':    settled[3].status,
      'v2/stage-conv:cohort':      settled[4].status,
      'v2/handoffs:month':         settled[5].status,
      'v2/cohort-deals:month':     settled[6].status,
      'v2/cohort-deals:quarter':   settled[7].status,
    };

  } else if (tier === 'cold') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/v2/sales-metrics?period=lastweek'),
      fetchInternal(host, '/api/v2/sales-metrics?period=lastmonth'),
      fetchInternal(host, '/api/v2/sales-metrics?period=q1'),
      fetchInternal(host, '/api/v2/sales-metrics?period=q2'),
      fetchInternal(host, '/api/v2/sales-metrics?period=q3'),
      fetchInternal(host, '/api/v2/sales-metrics?period=q4'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=q1'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=q2'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=q3'),
      fetchInternal(host, '/api/v2/sales-cohort-deals?period=q4'),
    ]);

    results = {
      'v2/metrics:lastweek':  settled[0].status,
      'v2/metrics:lastmonth': settled[1].status,
      'v2/metrics:q1':        settled[2].status,
      'v2/metrics:q2':        settled[3].status,
      'v2/metrics:q3':        settled[4].status,
      'v2/metrics:q4':        settled[5].status,
      'v2/cohort:q1':         settled[6].status,
      'v2/cohort:q2':         settled[7].status,
      'v2/cohort:q3':         settled[8].status,
      'v2/cohort:q4':         settled[9].status,
    };

  } else if (tier === 'drilldown') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/v2/sales-metrics?include=deals&period=today'),
      fetchInternal(host, '/api/v2/sales-metrics?include=deals&period=week'),
      fetchInternal(host, '/api/v2/sales-metrics?include=deals&period=month'),
    ]);

    results = {
      'v2/metrics+deals:today': settled[0].status,
      'v2/metrics+deals:week':  settled[1].status,
      'v2/metrics+deals:month': settled[2].status,
    };

  } else {
    return res.status(400).json({ ok: false, error: `Unknown tier: ${tier}` });
  }

  res.json({ ok: true, tier, results });
}
