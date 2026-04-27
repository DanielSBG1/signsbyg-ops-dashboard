import { classifyDealHealth } from './healthClassifier.js';

/**
 * Build the pipelineHealth response payload from open deals.
 *
 * Takes raw HubSpot deal objects, runs each through classifyDealHealth,
 * groups into per-pipeline hot/active/aging/cold buckets, and computes
 * totals. The resulting structure is consumed by the frontend
 * PipelineHealthSummary and PipelineHealthPage components.
 *
 * @param {Array} openDeals - Raw HubSpot deal objects (from getAllOpenDeals)
 * @param {Object} ownerMap - { ownerId: 'First Last', ... }
 * @param {Object} constants - All pipeline health constants from constants.js
 * @param {number} nowMs - Current time in ms (for testability)
 * @returns {Object} pipelineHealth payload
 */
export function buildPipelineHealth(openDeals, ownerMap, constants, nowMs = Date.now()) {
  const pipelineKeyById = {};
  for (const [key, { id }] of Object.entries(constants.PIPELINES)) {
    pipelineKeyById[id] = key;
  }

  // Map stage ID → label per pipeline for stageLabel enrichment
  const stageLabelByPipeline = {};
  if (constants.PIPELINE_STAGES) {
    for (const [pKey, stages] of Object.entries(constants.PIPELINE_STAGES)) {
      stageLabelByPipeline[pKey] = {};
      for (const s of stages) stageLabelByPipeline[pKey][s.id] = s.label;
    }
  }

  const closedStages = new Set([
    ...constants.CLOSED_WON_STAGES,
    ...constants.CLOSED_LOST_STAGES,
  ]);

  const byPipeline = {};
  for (const [key, { label }] of Object.entries(constants.PIPELINES)) {
    byPipeline[key] = {
      key,
      label,
      avgCycleDays: constants.AVG_CYCLE_DAYS[key] || 0,
      avgCycleSampleSize: constants.AVG_CYCLE_DEAL_COUNTS[key] || 0,
      buckets: { hot: [], active: [], aging: [], cold: [] },
      counts: { hot: 0, active: 0, aging: 0, cold: 0 },
      values: { hot: 0, active: 0, aging: 0, cold: 0 },
    };
  }

  let totalOpen = 0;
  let totalOpenValue = 0;

  for (const rawDeal of openDeals) {
    const props = rawDeal.properties || {};

    if (closedStages.has(props.dealstage)) continue;

    const pipelineKey = pipelineKeyById[props.pipeline];
    if (!pipelineKey || !byPipeline[pipelineKey]) continue;

    const result = classifyDealHealth(props, pipelineKey, constants, nowMs);
    const amount = parseFloat(props.amount) || 0;

    const ageDays = props.createdate
      ? Math.round((nowMs - Date.parse(props.createdate)) / 86400000)
      : 0;
    const stageAgeDays = props.hs_v2_date_entered_current_stage
      ? Math.round((nowMs - Date.parse(props.hs_v2_date_entered_current_stage)) / 86400000)
      : 0;

    const dealEntry = {
      id: rawDeal.id,
      name: props.dealname || 'Untitled',
      stage: props.dealstage,
      stageLabel: (stageLabelByPipeline[pipelineKey] && stageLabelByPipeline[pipelineKey][props.dealstage]) || props.dealstage,
      amount,
      ownerId: props.hubspot_owner_id || null,
      ownerName: ownerMap[props.hubspot_owner_id] || 'Unassigned',
      ageDays,
      stageAgeDays,
      reason: result.reason,
      priority: result.priority || null,
      createdate: props.createdate || null,
    };

    const bucket = byPipeline[pipelineKey].buckets[result.status];
    if (bucket) {
      bucket.push(dealEntry);
      byPipeline[pipelineKey].counts[result.status]++;
      byPipeline[pipelineKey].values[result.status] += amount;
    }

    totalOpen++;
    totalOpenValue += amount;
  }

  for (const pipelineKey of Object.keys(byPipeline)) {
    byPipeline[pipelineKey].buckets.aging.sort((a, b) => {
      if (a.priority !== b.priority) return (a.priority || 999) - (b.priority || 999);
      return b.stageAgeDays - a.stageAgeDays;
    });
    byPipeline[pipelineKey].buckets.hot.sort((a, b) => a.stageAgeDays - b.stageAgeDays);
    byPipeline[pipelineKey].buckets.cold.sort((a, b) => b.ageDays - a.ageDays);
  }

  // Designer queue: all open deals currently in a pre-design stage (any pipeline).
  // Counted independently of bucket (a pre-design deal might be in active or aging).
  let designQueueTotal = 0;
  let designQueueValue = 0;
  for (const rawDeal of openDeals) {
    const props = rawDeal.properties || {};
    if (closedStages.has(props.dealstage)) continue;
    const pKey = pipelineKeyById[props.pipeline];
    if (!pKey) continue;
    const preDesignStages = constants.PRE_DESIGN_STAGES[pKey] || [];
    if (preDesignStages.includes(props.dealstage)) {
      designQueueTotal++;
      designQueueValue += parseFloat(props.amount) || 0;
    }
  }

  let totalHot = 0, totalHotVal = 0;
  let totalAging = 0, totalAgingVal = 0;
  let totalCold = 0, totalColdVal = 0;
  let totalStuckPreDesign = 0;
  for (const p of Object.values(byPipeline)) {
    totalHot += p.counts.hot;
    totalHotVal += p.values.hot;
    totalAging += p.counts.aging;
    totalAgingVal += p.values.aging;
    totalCold += p.counts.cold;
    totalColdVal += p.values.cold;
    for (const d of p.buckets.aging) {
      if (d.reason === 'stuck_pre_design') totalStuckPreDesign++;
    }
  }

  return {
    generatedAt: constants.AVG_CYCLE_GENERATED_AT,
    totals: {
      open: totalOpen,
      openValue: totalOpenValue,
      hot: totalHot,
      hotValue: totalHotVal,
      aging: totalAging,
      agingValue: totalAgingVal,
      cold: totalCold,
      coldValue: totalColdVal,
      stuckPreDesign: totalStuckPreDesign,
      designQueue: designQueueTotal,
      designQueueValue,
    },
    byPipeline,
  };
}
