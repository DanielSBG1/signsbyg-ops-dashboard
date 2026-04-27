import { getAllOpenDeals, getDealsInRange } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES } from './_lib/sales/constants.js';
import { buildPipeline } from './_lib/sales/pipelineBuilder.js';
import { getCached, setCached } from './_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const { period = 'all', start: customStart, end: customEnd } = req.query;

    const cacheKey = `pipelinev1:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    if (period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    let deals;
    if (period === 'all') {
      const result = await getAllOpenDeals();
      deals = result.results;
    } else {
      const range = getDateRange(period, customStart, customEnd);
      const result = await getDealsInRange(range.start, range.end);
      deals = result.results;
    }

    const pipeline = buildPipeline(deals, {
      PIPELINES,
      PIPELINE_STAGES,
      CLOSED_WON_STAGES,
      CLOSED_LOST_STAGES,
      includeClosedStages: period !== 'all',
    });

    await setCached(cacheKey, pipeline, 60);
    return res.status(200).json(pipeline);
  } catch (err) {
    console.error('[pipeline] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
