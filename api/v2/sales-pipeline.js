/**
 * v2/sales-pipeline — reads from Supabase hubspot_deals table.
 *
 * Replaces the v1 endpoint that reads from HubSpot API.
 * Single Supabase query instead of paginated HubSpot polling.
 * Expected response time: <300ms.
 *
 * Query params:
 *   period  — 'all' (default) | 'today' | 'week' | 'month' | 'lastmonth' |
 *             'quarter' | 'q1'–'q4' | 'year' | 'custom'
 *   start   — ISO date string (required when period=custom)
 *   end     — ISO date string (required when period=custom)
 */
import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES } from '../_lib/sales/constants.js';
import { buildPipeline } from '../_lib/sales/pipelineBuilder.js';
import { getCached, setCached } from '../_lib/cache.js';

const CACHE_TTL = 60;

/**
 * Transforms a Supabase hubspot_deals row into the shape buildPipeline() expects.
 * The row's `properties` JSONB already contains the HubSpot field names, so we
 * just need to surface `id` at the top level alongside `properties`.
 */
function rowToDeal(row) {
  return {
    id: String(row.id),
    properties: {
      dealname:         row.properties?.dealname         ?? null,
      dealstage:        row.properties?.dealstage        ?? null,
      pipeline:         row.properties?.pipeline         ?? null,
      amount:           row.properties?.amount           ?? null,
      hubspot_owner_id: row.properties?.hubspot_owner_id ?? null,
      createdate:       row.properties?.createdate       ?? null,
      closedate:        row.properties?.closedate        ?? null,
      hs_is_closed:     row.properties?.hs_is_closed     ?? null,
      hs_lastmodifieddate: row.properties?.hs_lastmodifieddate ?? null,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const { period = 'all', start: customStart, end: customEnd } = req.query;

    if (period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    const cacheKey = `pipelinev2:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    let rows;

    if (period === 'all') {
      // All open deals — exclude rows where hs_is_closed is explicitly 'true'
      const { data, error } = await supabase
        .from('hubspot_deals')
        .select('id, properties')
        .or('properties->>hs_is_closed.is.null,properties->>hs_is_closed.neq.true');

      if (error) throw new Error(`Supabase query failed: ${error.message}`);
      rows = data;
    } else {
      // Period-filtered cohort — deals created within the date range
      const range = getDateRange(period, customStart, customEnd);

      const { data, error } = await supabase
        .from('hubspot_deals')
        .select('id, properties')
        .gte('properties->>createdate', range.start)
        .lte('properties->>createdate', range.end);

      if (error) throw new Error(`Supabase query failed: ${error.message}`);
      rows = data;
    }

    const deals = (rows || []).map(rowToDeal);

    const pipeline = buildPipeline(deals, {
      PIPELINES,
      PIPELINE_STAGES,
      CLOSED_WON_STAGES,
      CLOSED_LOST_STAGES,
      includeClosedStages: period !== 'all',
    });

    await setCached(cacheKey, pipeline, CACHE_TTL);
    return res.status(200).json(pipeline);
  } catch (err) {
    console.error('[v2/pipeline] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
