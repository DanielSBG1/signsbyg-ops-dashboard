import { getDealsInRange, getAllOpenDeals } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES, mapDealLeadSource } from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';

// wonSinceMs: if provided, won deals with closedate before this timestamp are excluded.
// Used in snapshot mode to limit the Won stage to the current year only.
function buildFunnel(deals, pipelineId, pKey, wonSinceMs = null) {
  const closedStageIds = [...CLOSED_WON_STAGES, ...CLOSED_LOST_STAGES];
  const openStages = (PIPELINE_STAGES[pKey] || []).filter((s) => !closedStageIds.includes(s.id));
  if (openStages.length === 0) return [];

  const stageIndex = {};
  openStages.forEach((s, i) => { stageIndex[s.id] = i; });
  const stageDeals = openStages.map(() => []);
  const wonDeals = [];

  for (const d of deals) {
    const props = d.properties;
    if (props.pipeline !== pipelineId) continue;
    const source = mapDealLeadSource(props.lead_source) || 'other';
    const dealSummary = { id: d.id, name: props.dealname || 'Unnamed Deal', amount: parseFloat(props.amount) || 0, source };

    if (CLOSED_WON_STAGES.includes(props.dealstage)) {
      if (wonSinceMs !== null && props.closedate) {
        if (new Date(props.closedate).getTime() < wonSinceMs) continue;
      }
      wonDeals.push(dealSummary);
    } else if (!CLOSED_LOST_STAGES.includes(props.dealstage)) {
      const idx = stageIndex[props.dealstage];
      if (idx != null) stageDeals[idx].push(dealSummary);
    }
  }

  const funnelStages = openStages.map((s, i) => ({
    id: s.id,
    label: s.label,
    reached: stageDeals[i].length,
    deals: stageDeals[i],
    conversionToNext: null,
  }));

  for (let i = 0; i < funnelStages.length - 1; i++) {
    if (funnelStages[i].reached > 0) {
      funnelStages[i].conversionToNext = Math.round((funnelStages[i + 1].reached / funnelStages[i].reached) * 100);
    }
  }

  const last = funnelStages[funnelStages.length - 1];
  if (last && last.reached > 0) {
    last.conversionToNext = Math.round((wonDeals.length / last.reached) * 100);
  }

  funnelStages.push({ id: 'won', label: 'Won', reached: wonDeals.length, deals: wonDeals, conversionToNext: null, terminal: true });

  return funnelStages;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'month', start: customStart, end: customEnd, mode = 'cohort' } = req.query;

    if (mode === 'cohort' && period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const cacheKey = `stageconvv11:${mode}:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) { console.log(`[Cache HIT] ${cacheKey}`); return res.status(200).json(hit); }
    console.log(`[Cache MISS] ${cacheKey}`);

    let results;
    let wonSinceMs = null;

    if (mode === 'snapshot') {
      const res2 = await getAllOpenDeals();
      results = res2.results;
      // Limit Won stage to this calendar year so we don't show all-time closures
      wonSinceMs = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    } else {
      const range = getDateRange(period, customStart, customEnd);
      const res2 = await getDealsInRange(range.start, range.end);
      results = res2.results;
    }

    const conversion = {};
    for (const [pKey, { id: pipelineId }] of Object.entries(PIPELINES)) {
      conversion[pKey] = buildFunnel(results, pipelineId, pKey, wonSinceMs);
    }

    const result = { conversion, mode };
    await setCached(cacheKey, result, 60);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[stage-conversion] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
