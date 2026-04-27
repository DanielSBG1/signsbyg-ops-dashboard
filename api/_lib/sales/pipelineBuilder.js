const STALE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Groups an array of HubSpot deal objects into a pipeline summary keyed by
 * pipeline key (e.g. 'retail', 'gc', 'wholesale', 'pm').
 *
 * @param {Array} deals - Raw HubSpot deal objects (must have .properties)
 * @param {Object} opts
 * @param {Object} opts.PIPELINES       - { retail: { id, label }, ... }
 * @param {Object} opts.PIPELINE_STAGES - { retail: [{ id, label }], ... }
 * @param {string[]} opts.CLOSED_WON_STAGES
 * @param {string[]} opts.CLOSED_LOST_STAGES
 * @param {boolean} [opts.includeClosedStages=false]
 *   false → only open stages shown, closed-stage deals excluded from counts
 *   true  → all stages shown (use for period-filtered cohort views)
 */
export function buildPipeline(deals, {
  PIPELINES,
  PIPELINE_STAGES,
  CLOSED_WON_STAGES,
  CLOSED_LOST_STAGES,
  includeClosedStages = false,
}) {
  const now = Date.now();
  const closedStageIds = [...CLOSED_WON_STAGES, ...CLOSED_LOST_STAGES];
  const pipeline = {};

  for (const [key, { id, label }] of Object.entries(PIPELINES)) {
    const allPipelineDeals = deals.filter((d) => d.properties.pipeline === id);
    const pipelineDeals = includeClosedStages
      ? allPipelineDeals
      : allPipelineDeals.filter((d) => !closedStageIds.includes(d.properties.dealstage));

    const stageList = includeClosedStages
      ? (PIPELINE_STAGES[key] || [])
      : (PIPELINE_STAGES[key] || []).filter((s) => !closedStageIds.includes(s.id));

    const stages = stageList.map((s) => {
      const stageDeals = pipelineDeals.filter((d) => d.properties.dealstage === s.id);
      return {
        id: s.id,
        label: s.label,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0),
        deals: stageDeals.map((d) => ({
          id: d.id,
          name: d.properties.dealname || 'Unnamed Deal',
          amount: parseFloat(d.properties.amount) || 0,
        })),
      };
    });

    const dealList = pipelineDeals.map((d) => {
      const stageLabel = stageList.find((s) => s.id === d.properties.dealstage)?.label || d.properties.dealstage;
      return {
        id: d.id,
        name: d.properties.dealname || 'Unnamed Deal',
        stage: stageLabel,
        amount: parseFloat(d.properties.amount) || 0,
      };
    });

    const staleList = pipelineDeals
      .filter((d) => {
        const modified = new Date(d.properties.hs_lastmodifieddate).getTime();
        return now - modified > STALE_MS;
      })
      .map((d) => {
        const stageLabel = stageList.find((s) => s.id === d.properties.dealstage)?.label || d.properties.dealstage;
        const daysSince = Math.floor((now - new Date(d.properties.hs_lastmodifieddate).getTime()) / (24 * 60 * 60 * 1000));
        return {
          id: d.id,
          name: d.properties.dealname || 'Unnamed Deal',
          stage: stageLabel,
          amount: parseFloat(d.properties.amount) || 0,
          daysSince,
        };
      })
      .sort((a, b) => b.daysSince - a.daysSince);

    pipeline[key] = {
      label,
      stages,
      totalValue: stages.reduce((sum, s) => sum + s.value, 0),
      totalDeals: pipelineDeals.length,
      dealList,
      staleDeals: staleList.length,
      staleList,
    };
  }

  return pipeline;
}
