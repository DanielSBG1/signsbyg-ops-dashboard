/**
 * Tiered cache warmup — keeps KV/CDN hot so user requests hit cache.
 *
 * hot (every 5 min):  v2 PM/Production/Installation (Supabase) + Sales today/week
 * warm (every 15 min): Sales month/quarter + sources + conversions + handoffs
 * cold (every 30 min): Sales historical periods (lastweek, lastmonth, q1-q4)
 * drilldown (every 15 min): Sales deals drill-down for active periods
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
    // v2 Supabase endpoints — fast, <200ms each
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/v2/pm-metrics'),
      fetchInternal(host, '/api/v2/pm-audit'),
      fetchInternal(host, '/api/v2/production-metrics'),
      fetchInternal(host, '/api/v2/production-throughput'),
      fetchInternal(host, '/api/v2/installation-metrics'),
      // Sales — still v1, hits HubSpot
      fetchInternal(host, '/api/sales-metrics?period=today'),
      fetchInternal(host, '/api/sales-metrics?period=week'),
      fetchInternal(host, '/api/sales-pipeline'),
      fetchInternal(host, '/api/sales-calls'),
    ]);

    results = {
      'v2/pm-metrics':          settled[0].status,
      'v2/pm-audit':            settled[1].status,
      'v2/production-metrics':  settled[2].status,
      'v2/production-throughput': settled[3].status,
      'v2/installation-metrics': settled[4].status,
      'sales-metrics:today':    settled[5].status,
      'sales-metrics:week':     settled[6].status,
      'sales-pipeline':         settled[7].status,
      'sales-calls':            settled[8].status,
    };

  } else if (tier === 'warm') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/sales-metrics?period=month'),
      fetchInternal(host, '/api/sales-metrics?period=quarter'),
      fetchInternal(host, '/api/sales-sources?period=month'),
      fetchInternal(host, '/api/sales-stage-conversion?mode=snapshot'),
      fetchInternal(host, '/api/sales-stage-conversion?mode=cohort&period=month'),
      fetchInternal(host, '/api/sales-handoffs?period=month'),
      fetchInternal(host, '/api/sales-cohort-deals?period=month'),
      fetchInternal(host, '/api/sales-cohort-deals?period=quarter'),
    ]);

    results = {
      'sales-metrics:month':              settled[0].status,
      'sales-metrics:quarter':            settled[1].status,
      'sales-sources:month':              settled[2].status,
      'sales-stage-conversion:snapshot':  settled[3].status,
      'sales-stage-conversion:cohort/month': settled[4].status,
      'sales-handoffs:month':             settled[5].status,
      'sales-cohort-deals:month':         settled[6].status,
      'sales-cohort-deals:quarter':       settled[7].status,
    };

  } else if (tier === 'cold') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/sales-metrics?period=lastweek'),
      fetchInternal(host, '/api/sales-metrics?period=lastmonth'),
      fetchInternal(host, '/api/sales-metrics?period=q1'),
      fetchInternal(host, '/api/sales-metrics?period=q2'),
      fetchInternal(host, '/api/sales-metrics?period=q3'),
      fetchInternal(host, '/api/sales-metrics?period=q4'),
      fetchInternal(host, '/api/sales-cohort-deals?period=q1'),
      fetchInternal(host, '/api/sales-cohort-deals?period=q2'),
      fetchInternal(host, '/api/sales-cohort-deals?period=q3'),
      fetchInternal(host, '/api/sales-cohort-deals?period=q4'),
    ]);

    results = {
      'sales-metrics:lastweek':      settled[0].status,
      'sales-metrics:lastmonth':     settled[1].status,
      'sales-metrics:q1':            settled[2].status,
      'sales-metrics:q2':            settled[3].status,
      'sales-metrics:q3':            settled[4].status,
      'sales-metrics:q4':            settled[5].status,
      'sales-cohort-deals:q1':       settled[6].status,
      'sales-cohort-deals:q2':       settled[7].status,
      'sales-cohort-deals:q3':       settled[8].status,
      'sales-cohort-deals:q4':       settled[9].status,
    };

  } else if (tier === 'drilldown') {
    const settled = await Promise.allSettled([
      fetchInternal(host, '/api/sales-metrics?include=deals&period=today'),
      fetchInternal(host, '/api/sales-metrics?include=deals&period=week'),
      fetchInternal(host, '/api/sales-metrics?include=deals&period=month'),
    ]);

    results = {
      'sales-metrics+deals:today': settled[0].status,
      'sales-metrics+deals:week':  settled[1].status,
      'sales-metrics+deals:month': settled[2].status,
    };

  } else {
    return res.status(400).json({ ok: false, error: `Unknown tier: ${tier}` });
  }

  res.json({ ok: true, tier, results });
}
