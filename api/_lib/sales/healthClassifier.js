/**
 * Classify an open deal's health status.
 */
export function classifyDealHealth(deal, pipelineKey, constants, nowMs = Date.now()) {
  const {
    AVG_CYCLE_DAYS,
    HOT_STAGES_BY_PIPELINE,
    STICKY_HOT_STAGES_BY_PIPELINE,
    DESIGN_MILESTONE_STAGE,
    PRE_DESIGN_STAGES,
    POST_DESIGN_STAGE,
  } = constants;

  const stage = deal.dealstage;
  const hotStages = HOT_STAGES_BY_PIPELINE[pipelineKey] || [];
  const stickyHotStages = (STICKY_HOT_STAGES_BY_PIPELINE && STICKY_HOT_STAGES_BY_PIPELINE[pipelineKey]) || [];
  const preDesignStages = PRE_DESIGN_STAGES[pipelineKey] || [];
  const postDesignStage = POST_DESIGN_STAGE[pipelineKey];

  const lastActivity = computeLastActivity(deal);
  const daysSinceActivity = (nowMs - lastActivity) / 86400000;
  const stagnant = daysSinceActivity >= 14;

  const ageDays = deal.createdate
    ? (nowMs - Date.parse(deal.createdate)) / 86400000
    : 0;
  const stageAgeDays = deal.hs_v2_date_entered_current_stage
    ? (nowMs - Date.parse(deal.hs_v2_date_entered_current_stage)) / 86400000
    : 0;

  // === HOT-STICKY: Sticky hot stages (e.g. Invoice Sent) — always hot, no decay ===
  if (stickyHotStages.includes(stage)) {
    return { status: 'hot', reason: 'hot_stage' };
  }

  // === HOT-A: In a designated hot stage AND not stagnant ===
  if (hotStages.includes(stage) && !stagnant) {
    return { status: 'hot', reason: 'hot_stage' };
  }

  // === HOT-B: Velocity — reached post-design within 3 days, not stagnant ===
  if (postDesignStage && stage === postDesignStage && ageDays <= 3 && !stagnant) {
    return { status: 'hot', reason: 'velocity' };
  }

  // === AGING-1: Pre-design stuck > 2 days (TOP PRIORITY) ===
  if (preDesignStages.includes(stage) && stageAgeDays > 2) {
    return { status: 'aging', reason: 'stuck_pre_design', priority: 1 };
  }

  // === AGING-2: Hot stage decayed — was in a hot stage but stagnant 14+ days ===
  if (hotStages.includes(stage) && stagnant) {
    return { status: 'aging', reason: 'hot_stage_decayed', priority: 2 };
  }

  // === AGING-3: Velocity decayed — post-design within 3 days but stagnant ===
  if (postDesignStage && stage === postDesignStage && ageDays <= 3 && stagnant) {
    return { status: 'aging', reason: 'velocity_decayed', priority: 2 };
  }

  // === AGING-4: Age between 100% and 150% of pipeline avg cycle ===
  const avgCycle = AVG_CYCLE_DAYS[pipelineKey];
  if (avgCycle > 0 && ageDays >= avgCycle && ageDays <= avgCycle * 1.5) {
    return { status: 'aging', reason: 'age_threshold', priority: 3 };
  }

  // === COLD: Age > 150% of avg cycle ===
  if (avgCycle > 0 && ageDays > avgCycle * 1.5) {
    return { status: 'cold', reason: 'too_old' };
  }

  // === Default: ACTIVE ===
  return { status: 'active', reason: 'normal' };
}

/**
 * Returns timestamp (ms) of the most recent activity signal on the deal.
 * Combines 3 HubSpot fields — if any one is fresh, the deal is considered active.
 *
 * Stage entry (`hs_v2_date_entered_current_stage`) is intentionally NOT included.
 * Stage age is structural metadata tracked separately as stageAgeDays. Including
 * it here would prevent AGING-3 (velocity_decayed) from ever firing, since a deal
 * that just entered a new stage would always have "fresh" stage entry activity.
 *
 * If no activity timestamps exist (e.g. very stripped-down test fixtures), this
 * returns 0, which makes daysSinceActivity huge and the deal will be treated as
 * stagnant. In production, real HubSpot deals always have hs_lastmodifieddate set
 * (it's updated on every record edit including creation), so this edge case only
 * affects synthetic test data.
 */
function computeLastActivity(deal) {
  const candidates = [
    deal.notes_last_contacted,
    deal.notes_last_updated,
    deal.hs_lastmodifieddate,
  ]
    .map((v) => (v ? Date.parse(v) : 0))
    .filter((n) => Number.isFinite(n));
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}
