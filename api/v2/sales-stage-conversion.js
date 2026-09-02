import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES, mapDealLeadSource } from '../_lib/sales/constants.js';
import { getCached, setCached } from '../_lib/cache.js';

/**
 * Fetch deals created within [start, end) from hubspot_deals.
 * Returns rows with { id, properties }.
 */
async function getDealsInRange(start, end) {
  const { data, error } = await supabase
    .from('hubspot_deals')
    .select('id, properties')
    .gte('properties->>createdate', start)
    .lt('properties->>createdate', end);

  if (error) throw new Error(`Supabase cohort query failed: ${error.message}`);
  return data || [];
}

/**
 * Fetch all deals that are not closed (hs_is_closed is false or null).
 * Returns rows with { id, properties }.
 */
async function getAllOpenDeals() {
  const { data, error } = await supabase
    .from('hubspot_deals')
    .select('id, properties')
    .or('properties->>hs_is_closed.eq.false,properties->>hs_is_closed.is.null');

  if (error) throw new Error(`Supabase snapshot query failed: ${error.message}`);
  return data || [];
}

/**
 * Build a stage funnel for a single pipeline from an array of deal rows.
 *
 * @param {Array}  deals       - rows from hubspot_deals (each has .id and .properties JSONB)
 * @param {string} pipelineId  - HubSpot pipeline ID string (e.g. 'default', '98976863')
 * @param {string} pKey        - internal pipeline key ('retail' | 'gc' | 'wholesale' | 'pm')
 * @param {number|null} wonSinceMs - epoch ms; Won deals with closedate before this are excluded
 * @returns {Array} funnel stage objects with { id, label, reached, deals, conversionToNext }
 */
function buildFunnel(deals, pipelineId, pKey, wonSinceMs = null) {
  const closedStageIds = [...CLOSED_WON_STAGES, ...CLOSED_LOST_STAGES];
  const openStages = (PIPELINE_STAGES[pKey] || []).filter((s) => !closedStageIds.includes(s.id));
  if (openStages.length === 0) return [];

  const stageIndex = {};
  openStages.forEach((s, i) => { stageIndex[s.id] = i; });
  const stageDeals = openStages.map(() => []);
  const wonDeals = [];

  for (const row of deals) {
    const props = row.properties || {};
    if (props.pipeline !== pipelineId) continue;

    const source = mapDealLeadSource(props.lead_source) || 'other';
    const dealSummary = {
      id: row.id,
      name: props.dealname || 'Unnamed Deal',
      amount: parseFloat(props.amount) || 0,
      source,
    };

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
      funnelStages[i].conversionToNext = Math.round(
        (funnelStages[i + 1].reached / funnelStages[i].reached) * 100
      );
    }
  }

  const last = funnelStages[funnelStages.length - 1];
  if (last && last.reached > 0) {
    last.conversionToNext = Math.round((wonDeals.length / last.reached) * 100);
  }

  funnelStages.push({
    id: 'won',
    label: 'Won',
    reached: wonDeals.length,
    deals: wonDeals,
    conversionToNext: null,
    terminal: true,
  });

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

    const cacheKey = `stageconv_v2:${mode}:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    let deals;
    let wonSinceMs = null;

    if (mode === 'snapshot') {
      deals = await getAllOpenDeals();
      // Limit Won stage to the current calendar year so stale all-time closures are excluded
      wonSinceMs = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    } else {
      const range = getDateRange(period, customStart, customEnd);
      deals = await getDealsInRange(range.start, range.end);
    }

    const conversion = {};
    for (const [pKey, { id: pipelineId }] of Object.entries(PIPELINES)) {
      conversion[pKey] = buildFunnel(deals, pipelineId, pKey, wonSinceMs);
    }

    const result = { conversion, mode };
    await setCached(cacheKey, result, 60);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[v2/sales-stage-conversion] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
