import { describe, it, expect } from 'vitest';
import { buildPipelineHealth } from './pipelineHealthBuilder.js';

const TEST_CONSTANTS = {
  AVG_CYCLE_DAYS: { retail: 30, gc: 80, wholesale: 14, pm: 35 },
  AVG_CYCLE_DEAL_COUNTS: { retail: 100, gc: 50, wholesale: 80, pm: 40 },
  AVG_CYCLE_GENERATED_AT: '2026-04-07',
  HOT_STAGES_BY_PIPELINE: {
    retail: ['1015831198', '999364883'],
    gc: ['1015831211', '1002292543'],
    wholesale: ['1015834148'],
    pm: ['1015891758', '1002209618'],
  },
  STICKY_HOT_STAGES_BY_PIPELINE: {
    retail: [],
    gc: [],
    wholesale: [],
    pm: [],
  },
  DESIGN_MILESTONE_STAGE: { retail: 'qualifiedtobuy', gc: '225153858', wholesale: null, pm: '999078929' },
  PRE_DESIGN_STAGES: { retail: ['appointmentscheduled'], gc: ['180986277', '225153857'], wholesale: [], pm: ['180989835'] },
  POST_DESIGN_STAGE: { retail: 'decisionmakerboughtin', gc: '180986278', wholesale: null, pm: '225693363' },
  PIPELINES: {
    retail: { id: 'default', label: 'Retail Commercial' },
    gc: { id: '98976863', label: 'General Contractors' },
    wholesale: { id: '99067273', label: 'Wholesale' },
    pm: { id: '99069236', label: 'Property Managers' },
  },
  PIPELINE_STAGES: {
    retail: [
      { id: 'appointmentscheduled', label: 'New Lead/Discovery' },
      { id: 'qualifiedtobuy', label: 'Proposal Drafting / Bid Preparation' },
      { id: 'decisionmakerboughtin', label: 'Proposal Sent & Awaiting Response' },
      { id: '1021118388', label: 'Cold Leads/No Response' },
      { id: '1015831198', label: 'Negotiation / HOT Deals' },
      { id: '999364883', label: 'Contract Sent / Invoice Sent' },
      { id: 'closedwon', label: 'Job Sold' },
      { id: 'closedlost', label: 'Lost' },
    ],
    gc: [],
    wholesale: [],
    pm: [],
  },
  CLOSED_WON_STAGES: ['closedwon', '180884010', '183201650', '180989837'],
  CLOSED_LOST_STAGES: ['closedlost', '180884012', '180986283', '180989841'],
};

const NOW = new Date('2026-04-07T12:00:00Z').getTime();

function rawDeal(overrides = {}) {
  return {
    id: 'd1',
    properties: {
      dealname: 'Test Deal',
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
      amount: '5000',
      hubspot_owner_id: '123',
      createdate: new Date(NOW - 5 * 86400000).toISOString(),
      hs_lastmodifieddate: new Date(NOW - 1 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 2 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 1 * 86400000).toISOString(),
      notes_last_updated: new Date(NOW - 1 * 86400000).toISOString(),
      ...overrides,
    },
  };
}

describe('buildPipelineHealth', () => {
  it('groups open deals into per-pipeline hot/active/aging/cold buckets', () => {
    const ownerMap = { '123': 'Test Rep' };
    const openDeals = [
      rawDeal({ dealname: 'Active Retail Deal' }),
    ];

    const result = buildPipelineHealth(openDeals, ownerMap, TEST_CONSTANTS, NOW);

    expect(result.totals).toEqual({
      open: 1,
      openValue: 5000,
      hot: 0,
      hotValue: 0,
      aging: 0,
      agingValue: 0,
      cold: 0,
      coldValue: 0,
      designQueue: 0,
      designQueueValue: 0,
      stuckPreDesign: 0,
    });
    expect(result.byPipeline.retail.label).toBe('Retail Commercial');
    expect(result.byPipeline.retail.avgCycleDays).toBe(30);
    expect(result.byPipeline.retail.avgCycleSampleSize).toBe(100);
    expect(result.byPipeline.retail.buckets.active).toHaveLength(1);
    expect(result.byPipeline.retail.buckets.active[0].name).toBe('Active Retail Deal');
    expect(result.byPipeline.retail.buckets.hot).toHaveLength(0);
    expect(result.byPipeline.retail.buckets.aging).toHaveLength(0);
    expect(result.byPipeline.retail.buckets.cold).toHaveLength(0);
  });

  it('skips closed deals (won and lost)', () => {
    const closedWon = rawDeal({ dealstage: 'closedwon' });
    const closedLost = rawDeal({ dealstage: 'closedlost' });
    const result = buildPipelineHealth([closedWon, closedLost], {}, TEST_CONSTANTS, NOW);
    expect(result.totals.open).toBe(0);
  });

  it('sorts aging deals by priority ascending then by stage age descending', () => {
    const stuckPreDesign = rawDeal({
      id: 'd2',
      dealname: 'Stuck Pre-Design',
      dealstage: 'appointmentscheduled',
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(),
      createdate: new Date(NOW - 5 * 86400000).toISOString(),
    });
    const ageBased = rawDeal({
      id: 'd3',
      dealname: 'Age Threshold',
      dealstage: 'qualifiedtobuy',
      createdate: new Date(NOW - 35 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 30 * 86400000).toISOString(),
    });
    // Pass in reverse order to verify sort actually runs
    const result = buildPipelineHealth([ageBased, stuckPreDesign], {}, TEST_CONSTANTS, NOW);
    const aging = result.byPipeline.retail.buckets.aging;
    expect(aging).toHaveLength(2);
    expect(aging[0].name).toBe('Stuck Pre-Design');
    expect(aging[0].priority).toBe(1);
    expect(aging[1].name).toBe('Age Threshold');
    expect(aging[1].priority).toBe(3);
    expect(result.totals.stuckPreDesign).toBe(1);
  });

  it('returns 0 counts when there are no deals', () => {
    const result = buildPipelineHealth([], {}, TEST_CONSTANTS, NOW);
    expect(result.totals.open).toBe(0);
    expect(result.totals.hot).toBe(0);
    expect(result.totals.aging).toBe(0);
    expect(result.totals.cold).toBe(0);
    expect(result.byPipeline.retail.buckets.active).toHaveLength(0);
  });

  it('includes generatedAt in the response', () => {
    const result = buildPipelineHealth([], {}, TEST_CONSTANTS, NOW);
    expect(result.generatedAt).toBe('2026-04-07');
  });

  it('falls back to Unassigned when owner is not in the map', () => {
    const deal = rawDeal({ hubspot_owner_id: '999' });
    const result = buildPipelineHealth([deal], {}, TEST_CONSTANTS, NOW);
    expect(result.byPipeline.retail.buckets.active[0].ownerName).toBe('Unassigned');
  });

  it('includes lastContacted and pipelineKey on dealEntry', () => {
    const contactedAt = new Date(NOW - 2 * 86400000).toISOString();
    const deal = rawDeal({ notes_last_contacted: contactedAt });
    const result = buildPipelineHealth([deal], {}, TEST_CONSTANTS, NOW);
    const entry = result.byPipeline.retail.buckets.active[0];
    expect(entry.lastContacted).toBe(contactedAt);
    expect(entry.pipelineKey).toBe('retail');
  });

  it('computes nextStageLabel from PIPELINE_STAGES', () => {
    // qualifiedtobuy is index 1 in retail → next is decisionmakerboughtin = 'Proposal Sent & Awaiting Response'
    const deal = rawDeal({ dealstage: 'qualifiedtobuy' });
    const result = buildPipelineHealth([deal], {}, TEST_CONSTANTS, NOW);
    const entry = result.byPipeline.retail.buckets.active[0];
    expect(entry.nextStageLabel).toBe('Proposal Sent & Awaiting Response');
  });

  it('sets nextStageLabel to the next stage label for a stage near the end of PIPELINE_STAGES', () => {
    // 999364883 is index 5 in retail → next is 'Job Sold'
    const deal = rawDeal({ dealstage: '999364883' });
    const result = buildPipelineHealth([deal], {}, TEST_CONSTANTS, NOW);
    const entry = result.byPipeline.retail.buckets.hot[0]; // 999364883 is a hot stage
    expect(entry.nextStageLabel).toBe('Job Sold');
  });

  it('sets nextStageLabel to null when stage is not found in PIPELINE_STAGES', () => {
    const deal = rawDeal({ dealstage: 'unknown-stage-xyz' });
    const result = buildPipelineHealth([deal], {}, TEST_CONSTANTS, NOW);
    // unknown-stage-xyz won't match any pipeline stage → lands in active bucket with nextStageLabel null
    const entry = result.byPipeline.retail.buckets.active[0];
    expect(entry.nextStageLabel).toBeNull();
  });

  it('builds hubspotUrl when portalId is provided in constants', () => {
    const deal = rawDeal();
    deal.id = 'd-abc';
    const constants = { ...TEST_CONSTANTS, portalId: '45962246' };
    const result = buildPipelineHealth([deal], {}, constants, NOW);
    const entry = result.byPipeline.retail.buckets.active[0];
    expect(entry.hubspotUrl).toBe('https://app.hubspot.com/contacts/45962246/deal/d-abc');
  });

  it('sets hubspotUrl to null when portalId is absent', () => {
    const result = buildPipelineHealth([rawDeal()], {}, TEST_CONSTANTS, NOW);
    const entry = result.byPipeline.retail.buckets.active[0];
    expect(entry.hubspotUrl).toBeNull();
  });
});
