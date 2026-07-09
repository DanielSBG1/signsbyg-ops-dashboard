import { describe, it, expect } from 'vitest';
import { classifyDealHealth } from './healthClassifier.js';

// Helper to build a deal object with sensible defaults
function makeDeal(overrides = {}) {
  const now = new Date('2026-04-07T12:00:00Z');
  return {
    dealstage: 'qualifiedtobuy', // Proposal Drafting (post-pre-design, in retail)
    pipeline: 'default',         // Retail pipeline
    createdate: new Date(now.getTime() - 5 * 86400000).toISOString(),     // 5 days ago
    hs_v2_date_entered_current_stage: new Date(now.getTime() - 2 * 86400000).toISOString(), // 2 days ago
    notes_last_contacted: new Date(now.getTime() - 1 * 86400000).toISOString(),  // 1 day ago
    notes_last_updated: new Date(now.getTime() - 1 * 86400000).toISOString(),
    hs_lastmodifieddate: new Date(now.getTime() - 1 * 86400000).toISOString(),
    amount: '5000',
    ...overrides,
  };
}

describe('classifyDealHealth', () => {
  const NOW = new Date('2026-04-07T12:00:00Z').getTime();

  // Constants used in tests — match what the function will read from constants.js
  const TEST_CONSTANTS = {
    AVG_CYCLE_DAYS: { retail: 30, gc: 80, wholesale: 14, pm: 35 },
    HOT_STAGES_BY_PIPELINE: {
      retail: ['1015831198', '999364883'],
      gc: ['1015831211', '1002292543'],
      wholesale: ['1015834148'],
      pm: ['1015891758', '1002209618'],
    },
    DESIGN_MILESTONE_STAGE: {
      retail: 'qualifiedtobuy',
      gc: '225153858',
      wholesale: null,
      pm: '999078929',
    },
    PRE_DESIGN_STAGES: {
      retail: ['appointmentscheduled'],
      gc: ['180986277', '225153857'],
      wholesale: [],
      pm: ['180989835'],
    },
    POST_DESIGN_STAGE: {
      retail: 'decisionmakerboughtin',
      gc: '180986278',
      wholesale: null,
      pm: '225693363',
    },
  };

  it('returns ACTIVE for a normal deal in mid-funnel with recent activity', () => {
    const deal = makeDeal();  // 5 days old, in qualifiedtobuy, recent activity
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('active');
    expect(result.reason).toBe('normal');
  });

  it('returns HOT (hot_stage) for a deal in a hot stage with recent activity', () => {
    const deal = makeDeal({
      dealstage: '1015831198',  // Negotiation/HOT (retail hot stage)
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(), // 5 days in stage
      notes_last_contacted: new Date(NOW - 2 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('hot');
    expect(result.reason).toBe('hot_stage');
  });

  it('returns HOT (velocity) for a deal that reached post-design within 3 days', () => {
    const deal = makeDeal({
      dealstage: 'decisionmakerboughtin',  // Proposal Sent (post-design for retail)
      createdate: new Date(NOW - 2 * 86400000).toISOString(),  // 2 days old
      hs_v2_date_entered_current_stage: new Date(NOW - 1 * 86400000).toISOString(),  // 1 day in stage
      notes_last_contacted: new Date(NOW - 0.5 * 86400000).toISOString(),  // 12h ago
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('hot');
    expect(result.reason).toBe('velocity');
  });

  it('returns AGING (stuck_pre_design, priority 1) for a deal in pre-design stage > 2 days', () => {
    const deal = makeDeal({
      dealstage: 'appointmentscheduled',  // New Lead/Discovery — pre-design for retail
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(),  // 5 days in stage
      createdate: new Date(NOW - 5 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 1 * 86400000).toISOString(),  // recent activity, but stuck in stage
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('aging');
    expect(result.reason).toBe('stuck_pre_design');
    expect(result.priority).toBe(1);
  });

  it('returns ACTIVE for a deal that just entered pre-design (< 2 days)', () => {
    const deal = makeDeal({
      dealstage: 'appointmentscheduled',
      hs_v2_date_entered_current_stage: new Date(NOW - 1 * 86400000).toISOString(),  // 1 day in stage
      createdate: new Date(NOW - 1 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('active');
  });

  it('returns AGING (hot_stage_decayed, priority 2) for a hot-stage deal that is stagnant 14+ days', () => {
    const deal = makeDeal({
      dealstage: '1015831198',  // Negotiation/HOT
      hs_v2_date_entered_current_stage: new Date(NOW - 20 * 86400000).toISOString(),  // 20 days
      notes_last_contacted: new Date(NOW - 16 * 86400000).toISOString(),  // 16 days ago
      notes_last_updated: new Date(NOW - 16 * 86400000).toISOString(),
      hs_lastmodifieddate: new Date(NOW - 16 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('aging');
    expect(result.reason).toBe('hot_stage_decayed');
    expect(result.priority).toBe(2);
  });

  it('returns AGING (velocity_decayed, priority 2) for a velocity-eligible deal that stalled', () => {
    const deal = makeDeal({
      dealstage: 'decisionmakerboughtin',  // Proposal Sent (post-design for retail)
      createdate: new Date(NOW - 2 * 86400000).toISOString(),  // 2 days old (still velocity-eligible)
      hs_v2_date_entered_current_stage: new Date(NOW - 1 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 16 * 86400000).toISOString(),  // stagnant
      notes_last_updated: new Date(NOW - 16 * 86400000).toISOString(),
      hs_lastmodifieddate: new Date(NOW - 16 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('aging');
    expect(result.reason).toBe('velocity_decayed');
    expect(result.priority).toBe(2);
  });

  it('returns AGING (age_threshold, priority 3) for a deal aged 100%-150% of avg cycle', () => {
    // Avg cycle for retail = 30 days. 35 days old = 116% = aging.
    const deal = makeDeal({
      dealstage: 'qualifiedtobuy',  // Mid-pipeline, not pre-design, not hot, not post-design fast
      createdate: new Date(NOW - 35 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 1 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('aging');
    expect(result.reason).toBe('age_threshold');
    expect(result.priority).toBe(3);
  });

  it('returns COLD for a deal aged > 150% of avg cycle', () => {
    // Avg retail cycle = 30 days. 50 days old = 166% = cold.
    const deal = makeDeal({
      dealstage: 'qualifiedtobuy',
      createdate: new Date(NOW - 50 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 2 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(deal, 'retail', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('cold');
    expect(result.reason).toBe('too_old');
  });

  it('handles wholesale: HOT only when in hot stage with recent activity', () => {
    const wholesaleDeal = makeDeal({
      dealstage: '1015834148',  // High Interest/HOT (wholesale)
      pipeline: '99067273',
      hs_v2_date_entered_current_stage: new Date(NOW - 5 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 1 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(wholesaleDeal, 'wholesale', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('hot');
    expect(result.reason).toBe('hot_stage');
  });

  it('handles wholesale: never returns stuck_pre_design or velocity', () => {
    const wholesaleDeal = makeDeal({
      dealstage: '1015834148',
      pipeline: '99067273',
      createdate: new Date(NOW - 1 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 1 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 1 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(wholesaleDeal, 'wholesale', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('hot');
    expect(result.reason).toBe('hot_stage');
  });

  it('handles wholesale: stagnant hot deal decays to AGING (hot_stage_decayed)', () => {
    const wholesaleDeal = makeDeal({
      dealstage: '1015834148',
      pipeline: '99067273',
      createdate: new Date(NOW - 25 * 86400000).toISOString(),
      hs_v2_date_entered_current_stage: new Date(NOW - 16 * 86400000).toISOString(),
      notes_last_contacted: new Date(NOW - 16 * 86400000).toISOString(),
      notes_last_updated: new Date(NOW - 16 * 86400000).toISOString(),
      hs_lastmodifieddate: new Date(NOW - 16 * 86400000).toISOString(),
    });
    const result = classifyDealHealth(wholesaleDeal, 'wholesale', TEST_CONSTANTS, NOW);
    expect(result.status).toBe('aging');
    expect(result.reason).toBe('hot_stage_decayed');
  });
});
