// api/_lib/excellence/sales-scores.js
import { searchAllCRM }           from '../sales/hubspot.js';
import { CLOSED_WON_STAGES, CLOSED_LOST_STAGES, HOT_STAGES_BY_PIPELINE, PIPELINE_STAGES } from '../sales/constants.js';
import { rateScore, invertedRateScore, weightedScore, kpi } from './scoring.js';

/** Returns ISO date string N days ago. */
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Map period string to lookback days. */
function periodDays(period) {
  if (period === 'week')      return 7;
  if (period === 'lastmonth') return 60; // fetch 2 months, filter to prev 30
  if (period === 'quarter')   return 90;
  return 30; // month default
}

export async function computeSalesOperationalScore(period = 'month') {
  const days = periodDays(period);
  const since = daysAgo(days);

  // --- Win rate: closed won / (closed won + closed lost) in period ---
  const [wonDeals, lostDeals, activeDeals] = await Promise.all([
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: since },
        { propertyName: 'dealstage', operator: 'IN', values: CLOSED_WON_STAGES },
      ],
      properties: ['dealstage', 'closedate', 'dealname', 'amount'],
      limit: 200,
    }),
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: since },
        { propertyName: 'dealstage', operator: 'IN', values: CLOSED_LOST_STAGES },
      ],
      properties: ['dealstage', 'closedate'],
      limit: 200,
    }),
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'dealstage', operator: 'NOT_IN', values: [...CLOSED_WON_STAGES, ...CLOSED_LOST_STAGES] },
        { propertyName: 'createdate', operator: 'GTE', value: daysAgo(180) },
      ],
      properties: ['dealstage', 'createdate', 'amount', 'pipeline', 'hs_lastmodifieddate'],
      limit: 500,
    }),
  ]);

  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = totalClosed > 0 ? wonDeals.length / totalClosed : 0;

  // --- Pipeline health: hot deals / total active ---
  const hotStageIds = new Set(
    Object.values(HOT_STAGES_BY_PIPELINE).flat()
  );
  const hotCount    = activeDeals.filter(d => hotStageIds.has(d.properties.dealstage)).length;
  const pipelineHealthRate = activeDeals.length > 0 ? hotCount / activeDeals.length : 0;

  // --- Stage stagnation: deals in proposal stage > 14 days ---
  const proposalStageIds = new Set(
    Object.values(PIPELINE_STAGES)
      .flat()
      .filter(s => s.label.toLowerCase().includes('proposal') || s.label.toLowerCase().includes('awaiting'))
      .map(s => s.id)
  );
  const proposalDeals  = activeDeals.filter(d => proposalStageIds.has(d.properties.dealstage));
  const stagnantCount  = proposalDeals.filter(d => {
    const entered = d.properties.createdate;
    if (!entered) return false;
    return (Date.now() - new Date(entered).getTime()) > 14 * 86_400_000;
  }).length;
  const stagnationRate = proposalDeals.length > 0 ? stagnantCount / proposalDeals.length : 0;

  // --- Proposal sent rate: won + proposal deals / qualified deals ---
  const qualifiedStageIds = new Set(
    Object.values(PIPELINE_STAGES).flat()
      .filter(s => s.label.toLowerCase().includes('qualified') || s.label.toLowerCase().includes('drafting'))
      .map(s => s.id)
  );
  const qualifiedCount = activeDeals.filter(d => qualifiedStageIds.has(d.properties.dealstage)).length;
  const sentCount      = wonDeals.length + proposalDeals.length;
  const sentRate       = (qualifiedCount + sentCount) > 0 ? sentCount / (qualifiedCount + sentCount) : 0;

  // --- Revenue pipeline health: non-zero amount active deals ---
  const withAmount  = activeDeals.filter(d => parseFloat(d.properties.amount || '0') > 0).length;
  const amountRate  = activeDeals.length > 0 ? withAmount / activeDeals.length : 0;

  // --- Activity rate: deals updated in last 7 days ---
  const recentlyUpdated = activeDeals.filter(d => {
    const updatedAt = d.properties.hs_lastmodifieddate ?? d.properties.createdate;
    return updatedAt && new Date(updatedAt).getTime() > Date.now() - 7 * 86_400_000;
  }).length;
  const activityRate = activeDeals.length > 0 ? recentlyUpdated / activeDeals.length : 0;

  const kpis = [
    kpi('winRate',           'Win Rate',              rateScore(winRate),                       `${Math.round(winRate * 100)}%`,             0.25),
    kpi('pipelineHealth',    'Pipeline Health',        rateScore(pipelineHealthRate),            `${hotCount}/${activeDeals.length} hot`,    0.20),
    kpi('stagnationRate',    'Proposal Stagnation',    invertedRateScore(stagnationRate, 0.20),  `${Math.round(stagnationRate * 100)}%`,      0.20),
    kpi('sentRate',          'Proposal Sent Rate',     rateScore(sentRate),                      `${Math.round(sentRate * 100)}%`,            0.15),
    kpi('amountRate',        'Deals with Amount Set',  rateScore(amountRate),                    `${Math.round(amountRate * 100)}%`,          0.10),
    kpi('activityRate',      'Pipeline Activity',      rateScore(activityRate),                  `${recentlyUpdated}/${activeDeals.length}`,  0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
