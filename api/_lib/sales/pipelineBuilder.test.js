import { describe, it, expect } from 'vitest';
import { buildPipeline } from './pipelineBuilder.js';

const PIPELINES = {
  retail: { id: 'default', label: 'Retail Commercial' },
  gc: { id: '98976863', label: 'General Contractors' },
};
const PIPELINE_STAGES = {
  retail: [
    { id: 'appointmentscheduled', label: 'New Lead' },
    { id: 'qualifiedtobuy', label: 'Proposal Drafting' },
    { id: 'closedwon', label: 'Sold' },
    { id: 'closedlost', label: 'Lost' },
  ],
  gc: [
    { id: '225153857', label: 'ITB / Plan Review' },
    { id: '180884010', label: 'Sold' },
    { id: '180884012', label: 'Lost' },
  ],
};
const CLOSED_WON_STAGES = ['closedwon', '180884010'];
const CLOSED_LOST_STAGES = ['closedlost', '180884012'];

function makeDeal(pipeline, dealstage, amount, daysAgo = 1) {
  return {
    id: Math.random().toString(),
    properties: {
      pipeline,
      dealstage,
      amount: amount == null ? null : String(amount),
      hs_lastmodifieddate: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    },
  };
}

describe('buildPipeline', () => {
  it('groups deals by pipeline and stage', () => {
    const deals = [
      makeDeal('default', 'appointmentscheduled', 1000),
      makeDeal('default', 'appointmentscheduled', 500),
      makeDeal('default', 'qualifiedtobuy', 2000),
    ];
    const result = buildPipeline(deals, { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES });
    expect(result.retail.totalDeals).toBe(3);
    expect(result.retail.totalValue).toBe(3500);
    const newLead = result.retail.stages.find((s) => s.id === 'appointmentscheduled');
    expect(newLead.count).toBe(2);
    expect(newLead.value).toBe(1500);
  });

  it('excludes closed stages by default', () => {
    const deals = [
      makeDeal('default', 'appointmentscheduled', 1000),
      makeDeal('default', 'closedwon', 5000),
      makeDeal('default', 'closedlost', 2000),
    ];
    const result = buildPipeline(deals, { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES });
    const stageIds = result.retail.stages.map((s) => s.id);
    expect(stageIds).not.toContain('closedwon');
    expect(stageIds).not.toContain('closedlost');
  });

  it('includes closed stages when includeClosedStages=true', () => {
    const deals = [
      makeDeal('default', 'appointmentscheduled', 1000),
      makeDeal('default', 'closedwon', 5000),
    ];
    const result = buildPipeline(deals, {
      PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES,
      includeClosedStages: true,
    });
    const stageIds = result.retail.stages.map((s) => s.id);
    expect(stageIds).toContain('closedwon');
    const sold = result.retail.stages.find((s) => s.id === 'closedwon');
    expect(sold.count).toBe(1);
    expect(sold.value).toBe(5000);
  });

  it('flags stale deals (14+ days since last modification)', () => {
    const deals = [
      makeDeal('default', 'appointmentscheduled', 1000, 15), // stale
      makeDeal('default', 'qualifiedtobuy', 2000, 5),         // fresh
    ];
    const result = buildPipeline(deals, { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES });
    expect(result.retail.staleDeals).toBe(1);
  });

  it('returns zero totals for pipelines with no matching deals', () => {
    const deals = [makeDeal('default', 'appointmentscheduled', 1000)];
    const result = buildPipeline(deals, { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES });
    expect(result.gc.totalDeals).toBe(0);
    expect(result.gc.totalValue).toBe(0);
    expect(result.gc.staleDeals).toBe(0);
  });

  it('handles missing amount gracefully', () => {
    const deal = makeDeal('default', 'appointmentscheduled', null);
    const result = buildPipeline([deal], { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES });
    expect(result.retail.totalValue).toBe(0);
  });
});
