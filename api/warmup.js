import { cached } from './_lib/cache.js';
import { buildPmMetrics } from './_lib/pm/metrics.js';
import { buildPmAudit } from './_lib/pm/audit.js';
import { buildProductionMetrics } from './_lib/production/metrics.js';
import { buildThroughput } from './_lib/production/throughput.js';

export default async function handler(req, res) {
  const [pmMetrics, pmAudit, prodMetrics, prodThroughput] = await Promise.allSettled([
    cached('pm:metrics',      120, buildPmMetrics),
    cached('pm:audit',        120, buildPmAudit),
    cached('prod:metrics',    120, buildProductionMetrics),
    cached('prod:throughput', 300, buildThroughput),
  ]);

  res.json({
    ok: true,
    pmMetrics:     pmMetrics.status,
    pmAudit:       pmAudit.status,
    prodMetrics:   prodMetrics.status,
    prodThroughput: prodThroughput.status,
  });
}
