export const PIPELINES = {
  retail: { id: 'default', label: 'Retail Commercial' },
  gc: { id: '98976863', label: 'General Contractors' },
  wholesale: { id: '99067273', label: 'Wholesale' },
  pm: { id: '99069236', label: 'Property Managers' },
};

export const CLOSED_WON_STAGES = ['closedwon', '180884010', '183201650', '180989837'];
export const CLOSED_LOST_STAGES = ['closedlost', '180884012', '180986283', '180989841'];

export const PIPELINE_STAGES = {
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
  gc: [
    { id: '225153857', label: 'ITB / Plan Review' },
    { id: '225153858', label: 'Invited Bids Sent' },
    { id: '3514106575', label: 'Generic Bids Sent' },
    { id: '1015831211', label: 'Clarifications / Second Round Pricing' },
    { id: '1002292543', label: 'Pending Contract' },
    { id: '180884010', label: 'Job Sold / Contract Signed' },
    { id: '180884012', label: 'Job Lost' },
  ],
  wholesale: [
    { id: '180986277', label: 'Bid Request' },
    { id: '180986278', label: 'Bid Presented / Follow Up' },
    { id: '1015834148', label: 'High Interest / Hot Deals' },
    { id: '183201650', label: 'Job Sold' },
    { id: '180986283', label: 'Job Lost' },
  ],
  pm: [
    { id: '180989835', label: 'Bid Request' },
    { id: '999078929', label: 'Design / Bid Preparation' },
    { id: '225693363', label: 'Bid Presented / Follow Up' },
    { id: '1015891758', label: 'High Interest / Hot Deals' },
    { id: '1002209618', label: 'Job Pending Sale' },
    { id: '180989837', label: 'Job Sold' },
    { id: '180989841', label: 'Job Lost' },
  ],
};

export const SOURCE_MAP = {
  facebook: { label: 'Facebook', color: '#3b82f6' },
  paid_social_other: { label: 'Paid Social', color: '#a855f7' },
  paid_search: { label: 'Paid Search', color: '#8b5cf6' },
  email_extension: { label: 'Email Prospecting', color: '#f59e0b' },
  crm_manual: { label: 'CRM Manual', color: '#ef4444' },
  integration: { label: 'Integration', color: '#6366f1' },
  organic: { label: 'Organic', color: '#22c55e' },
  direct: { label: 'Direct / Website', color: '#06b6d4' },
  referrals: { label: 'Referrals', color: '#f97316' },
  walk_in: { label: 'Walk-In', color: '#eab308' },
  phone: { label: 'Phone Call', color: '#14b8a6' },
  repeat_client: { label: 'Repeat Client', color: '#10b981' },
  cold_outreach: { label: 'Cold Outreach', color: '#94a3b8' },
  other: { label: 'Other', color: '#64748b' },
};

// Maps a deal's custom `lead_source` property value to a SOURCE_MAP key.
// Used to override the contact's analytics source when the deal has a more accurate value.
export function mapDealLeadSource(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'walk in' || s === 'walk-in' || s === 'walkin') return 'walk_in';
  if (s === 'repeat client' || s === 'repeat customer') return 'repeat_client';
  if (s.includes('phone')) return 'phone';
  if (s === 'referrals' || s === 'referral') return 'referrals';
  if (s === 'paid social' || s === 'social_media' || s === 'paid_social') return 'facebook';
  if (s === 'paid_search' || s === 'paid search') return 'paid_search';
  if (s === 'organic_search' || s === 'organic') return 'organic';
  if (s.includes('cold')) return 'cold_outreach';
  if (s === 'direct_traffic' || s === 'direct' || s === 'website') return 'direct';
  if (s === 'email' || s.includes('email')) return 'email_extension';
  return null;
}

export function classifySource(analyticsSource, drilldown1) {
  if (analyticsSource === 'PAID_SOCIAL' && drilldown1 === 'Facebook') return 'facebook';
  if (analyticsSource === 'PAID_SOCIAL') return 'paid_social_other';
  if (analyticsSource === 'OFFLINE' && drilldown1 === 'EXTENSION') return 'email_extension';
  if (analyticsSource === 'OFFLINE' && drilldown1 === 'CRM_UI') return 'crm_manual';
  if (analyticsSource === 'OFFLINE' && drilldown1 === 'INTEGRATION') return 'integration';
  if (analyticsSource === 'OFFLINE') return 'crm_manual';
  if (analyticsSource === 'ORGANIC_SEARCH') return 'organic';
  if (analyticsSource === 'DIRECT_TRAFFIC') return 'direct';
  if (analyticsSource === 'REFERRALS') return 'referrals';
  return 'other';
}

export const DESIGNER_NAMES = ['yusseli', 'jonathan'];

// ============================================================
// Pipeline Health constants
// ============================================================

// Pre-computed by scripts/compute-avg-cycle.js
// Source: closed-won deals where createdate >= 2025-03-01
// (Excludes January 2025 bulk import from previous CRM)
//
// Refresh quarterly OR after meaningful sales process changes:
//   1. Run: node scripts/compute-avg-cycle.js
//   2. Paste the output below (replacing the existing values)
//   3. Commit
export const AVG_CYCLE_DAYS = {
  retail: 32,
  gc: 53,
  wholesale: 14,
  pm: 18,
};

export const AVG_CYCLE_GENERATED_AT = '2026-04-07';

// For "based on N deals" tooltip on each pipeline summary card
export const AVG_CYCLE_DEAL_COUNTS = {
  retail: 315,
  gc: 58,
  wholesale: 316,
  pm: 153,
};

// Stages that count as "HOT" — deal is currently in negotiation/closing
export const HOT_STAGES_BY_PIPELINE = {
  retail:    ['1015831198', '999364883'],     // Negotiation/HOT, Invoice Sent
  gc:        ['1015831211', '1002292543'],    // Negotiations/HOT, Pending Sale
  wholesale: ['1015834148'],                  // High Interest/HOT
  pm:        ['1015891758', '1002209618'],    // High Interest/HOT, Pending Sale
};

// "Sticky hot" stages: always classified as hot regardless of activity decay.
// Once an invoice is sent, the deal is committed — waiting on customer payment
// shouldn't reclassify it as aging. The >20-day red highlight catches stale ones.
export const STICKY_HOT_STAGES_BY_PIPELINE = {
  retail:    ['999364883'],     // Invoice Sent
  gc:        [],
  wholesale: [],
  pm:        [],
};

// The "design milestone" — reaching this stage means design has started/been done
export const DESIGN_MILESTONE_STAGE = {
  retail:    'qualifiedtobuy',           // Proposal Drafting
  gc:        '225153858',                // Bid Submitted (no design step in GC)
  wholesale: null,                       // N/A — wholesale has no design phase
  pm:        '999078929',                // Design / Bid Prep
};

// Pre-design stages — sitting in any of these for >2 days triggers AGING (top priority)
export const PRE_DESIGN_STAGES = {
  retail:    ['appointmentscheduled'],                    // New Lead/Discovery
  gc:        ['225153857'],                               // ITB/Plan Review
  wholesale: [],                                          // N/A
  pm:        ['180989835'],                               // Bid Request
};

// Stage IMMEDIATELY after the design milestone — used for velocity-HOT detection
// (A deal that reaches this stage within 3 days of creation = velocity HOT)
export const POST_DESIGN_STAGE = {
  retail:    'decisionmakerboughtin',    // Proposal Sent & Awaiting Response
  gc:        '225153858',                // Invited Bids Sent
  wholesale: null,                       // N/A
  pm:        '225693363',                // Bid Presented / Follow Up
};

// Map HubSpot pipeline ID -> our internal key ('retail' | 'gc' | 'wholesale' | 'pm')
export function pipelineKeyFromId(pipelineId) {
  for (const [key, { id }] of Object.entries(PIPELINES)) {
    if (id === pipelineId) return key;
  }
  return null;
}
