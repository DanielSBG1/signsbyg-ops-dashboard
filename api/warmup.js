import { cached, setCached } from './_lib/cache.js';
import { buildPmMetrics } from './_lib/pm/metrics.js';
import { buildProductionMetrics } from './_lib/production/metrics.js';
import { buildThroughput } from './_lib/production/throughput.js';

// ─── Slim helpers (mirror the logic in the API handlers) ─────────────────────

function slimPm(full) {
  if (!full) return full;
  const slim = {};
  for (const [key, dept] of Object.entries(full.departmentLoad ?? {})) {
    slim[key] = {
      label: dept.label,
      lead: dept.lead,
      count: dept.tasks?.length ?? 0,
      sectionOrder: dept.sectionOrder,
    };
  }
  return {
    generatedAt: full.generatedAt,
    totals: full.totals,
    departmentLoad: slim,
    schedule: full.schedule ?? null,
  };
}

function slimProd(full) {
  if (!full) return full;
  const deptSlim = {};
  for (const [key, jobs] of Object.entries(full.departmentLoad ?? {})) {
    deptSlim[key] = Array.isArray(jobs) ? jobs.length : jobs;
  }
  const schedSlim = {};
  for (const [period, stats] of Object.entries(full.schedule ?? {})) {
    if (stats && Array.isArray(stats.jobs)) {
      const { jobs: _jobs, ...rest } = stats;
      schedSlim[period] = rest;
    } else {
      schedSlim[period] = stats;
    }
  }
  return {
    generatedAt: full.generatedAt,
    totals: full.totals,
    departmentLoad: deptSlim,
    schedule: schedSlim,
  };
}

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
    // Build PM and production metrics first so we can derive slim pre-computed versions
    const [pmFull, prodFull] = await Promise.allSettled([
      buildPmMetrics(),
      buildProductionMetrics(),
    ]);

    // Write the full results to their existing cache keys
    if (pmFull.status === 'fulfilled') {
      await setCached('pm:metrics:full', pmFull.value, 120);
      await setCached('pm:metrics:precomputed', slimPm(pmFull.value), 300);
    }
    if (prodFull.status === 'fulfilled') {
      await setCached('prod:metrics:full', prodFull.value, 120);
      await setCached('prod:metrics:precomputed', slimProd(prodFull.value), 300);
    }

    const [prodThroughput, todayMetrics, weekMetrics, pipeline, calls] =
      await Promise.allSettled([
        cached('prod:throughput', 300, buildThroughput),
        fetchInternal(host, '/api/sales-metrics?period=today'),
        fetchInternal(host, '/api/sales-metrics?period=week'),
        fetchInternal(host, '/api/sales-pipeline'),
        fetchInternal(host, '/api/sales-calls'),
      ]);

    results = {
      'pm:metrics':               pmFull.status,
      'pm:metrics:precomputed':   pmFull.status,
      'prod:metrics':             prodFull.status,
      'prod:metrics:precomputed': prodFull.status,
      'prod:throughput': prodThroughput.status,
      'sales-metrics:today':  todayMetrics.status,
      'sales-metrics:week':   weekMetrics.status,
      'sales-pipeline':       pipeline.status,
      'sales-calls':          calls.status,
    };

  } else if (tier === 'warm') {
    const [monthMetrics, quarterMetrics, sourceMonth, snapshotConv, cohortConv, handoffsMonth, cohortMonth, cohortQuarter] =
      await Promise.allSettled([
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
      'sales-metrics:month':              monthMetrics.status,
      'sales-metrics:quarter':            quarterMetrics.status,
      'sales-sources:month':              sourceMonth.status,
      'sales-stage-conversion:snapshot':  snapshotConv.status,
      'sales-stage-conversion:cohort/month': cohortConv.status,
      'sales-handoffs:month':             handoffsMonth.status,
      'sales-cohort-deals:month':         cohortMonth.status,
      'sales-cohort-deals:quarter':       cohortQuarter.status,
    };

  } else if (tier === 'cold') {
    const [lastweek, lastmonth, q1, q2, q3, q4, cohortQ1, cohortQ2, cohortQ3, cohortQ4] =
      await Promise.allSettled([
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
      'sales-metrics:lastweek':      lastweek.status,
      'sales-metrics:lastmonth':     lastmonth.status,
      'sales-metrics:q1':            q1.status,
      'sales-metrics:q2':            q2.status,
      'sales-metrics:q3':            q3.status,
      'sales-metrics:q4':            q4.status,
      'sales-cohort-deals:q1':       cohortQ1.status,
      'sales-cohort-deals:q2':       cohortQ2.status,
      'sales-cohort-deals:q3':       cohortQ3.status,
      'sales-cohort-deals:q4':       cohortQ4.status,
    };

  } else if (tier === 'drilldown') {
    const [ddToday, ddWeek, ddMonth] =
      await Promise.allSettled([
        fetchInternal(host, '/api/sales-metrics?include=deals&period=today'),
        fetchInternal(host, '/api/sales-metrics?include=deals&period=week'),
        fetchInternal(host, '/api/sales-metrics?include=deals&period=month'),
      ]);

    results = {
      'sales-metrics+deals:today': ddToday.status,
      'sales-metrics+deals:week':  ddWeek.status,
      'sales-metrics+deals:month': ddMonth.status,
    };

  } else {
    return res.status(400).json({ ok: false, error: `Unknown tier: ${tier}` });
  }

  res.json({ ok: true, tier, results });
}
