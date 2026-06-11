// api/excellence-scores.js
import { getCached, setCached }                from './_lib/cache.js';
import { computePmOperationalScore }           from './_lib/excellence/pm-scores.js';
import { computeSalesOperationalScore }        from './_lib/excellence/sales-scores.js';
import { computeProductionOperationalScore }   from './_lib/excellence/production-scores.js';
import { computeInstallationOperationalScore } from './_lib/excellence/installation-scores.js';
import { computeAdminOperationalScore }        from './_lib/excellence/admin-scores.js';
import { computeCultureScore }                 from './_lib/excellence/culture.js';
import { compositeScore, computeGrade }        from './_lib/excellence/scoring.js';

const CACHE_KEY  = 'excellence:scores:v1';
const HIST_KEY   = 'excellence:history:v1';
const CACHE_TTL  = 120; // seconds

/** Returns a 0–100 proxy for team activity from their operational KPIs. */
function activityProxy(opsResult) {
  if (!opsResult?.kpis?.length) return 50;
  // Use the average of the top 3 scoring KPIs as a proxy for team engagement
  const sorted = [...opsResult.kpis].sort((a, b) => b.score - a.score);
  return Math.round(sorted.slice(0, 3).reduce((s, k) => s + k.score, 0) / Math.min(3, sorted.length));
}

async function buildExcellenceScores(period = 'month') {
  // --- Operational scores (parallel) ---
  const [pmOps, salesOps, prodOps, installOps] = await Promise.all([
    computePmOperationalScore().catch(e => { console.error('[excellence] pm-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeSalesOperationalScore(period).catch(e => { console.error('[excellence] sales-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeProductionOperationalScore().catch(e => { console.error('[excellence] prod-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeInstallationOperationalScore().catch(e => { console.error('[excellence] install-scores:', e.message); return { score: 50, kpis: [], dataUnavailable: true }; }),
  ]);

  // Admin needs other scores as input
  const adminOps = await computeAdminOperationalScore({
    pm: pmOps.score, production: prodOps.score, installation: installOps.score,
  }).catch(e => { console.error('[excellence] admin-scores:', e.message); return { score: 50, kpis: [] }; });

  // --- Culture scores (parallel, one per team) ---
  const [pmCulture, salesCulture, prodCulture, installCulture, adminCulture] = await Promise.all([
    computeCultureScore('pm',           activityProxy(pmOps)).catch(e => { console.error('[excellence] culture-pm:', e.message); return { score: 50, kpis: [] }; }),
    computeCultureScore('sales',        activityProxy(salesOps)).catch(e => { console.error('[excellence] culture-sales:', e.message); return { score: 50, kpis: [] }; }),
    computeCultureScore('production',   activityProxy(prodOps)).catch(e => { console.error('[excellence] culture-production:', e.message); return { score: 50, kpis: [] }; }),
    computeCultureScore('installation', activityProxy(installOps)).catch(e => { console.error('[excellence] culture-installation:', e.message); return { score: 50, kpis: [] }; }),
    computeCultureScore('admin',        activityProxy(adminOps)).catch(e => { console.error('[excellence] culture-admin:', e.message); return { score: 50, kpis: [] }; }),
  ]);

  // Reviews score: 50 (neutral) until Google Reviews integration is built in V2
  const REVIEWS_DEFAULT = 50;

  // --- Composite scores ---
  function buildTeam(id, label, emoji, opsResult, cultureResult) {
    const operational = opsResult.score;
    const culture     = cultureResult.score;
    const reviews     = REVIEWS_DEFAULT;
    const total       = compositeScore({ operational, culture, reviews });
    return {
      id, label, emoji,
      score: total,
      grade: computeGrade(total),
      operational: { score: operational, kpis: opsResult.kpis },
      culture:     { score: culture,     kpis: cultureResult.kpis },
      reviews:     { score: reviews },
      dataUnavailable: opsResult.dataUnavailable ?? false,
    };
  }

  const teams = {
    pm:           buildTeam('pm',           'PM',           '📋', pmOps,      pmCulture),
    sales:        buildTeam('sales',        'Sales',        '📊', salesOps,   salesCulture),
    production:   buildTeam('production',   'Production',   '🏭', prodOps,    prodCulture),
    installation: buildTeam('installation', 'Installation', '🔧', installOps, installCulture),
    admin:        buildTeam('admin',        'Admin',        '⚙️', adminOps,   adminCulture),
  };

  // --- Store history snapshot (current month entry) ---
  const monthStr  = new Date().toISOString().slice(0, 7);
  const history   = (await getCached(HIST_KEY)) ?? [];
  const snapshot  = {
    period: monthStr,
    pm:           teams.pm.score,
    sales:        teams.sales.score,
    production:   teams.production.score,
    installation: teams.installation.score,
    admin:        teams.admin.score,
  };
  const existingIdx = history.findIndex(h => h.period === monthStr);
  if (existingIdx >= 0) history[existingIdx] = snapshot;
  else                  history.push(snapshot);
  // Keep last 12 months
  const trimmed = history.sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  await setCached(HIST_KEY, trimmed, 60 * 60 * 24 * 400); // ~13 months

  return {
    generatedAt: new Date().toISOString(),
    period,
    teams,
    history: trimmed,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const period = req.query.period ?? 'month';
  const bust   = req.query.bust === '1';
  const key    = `${CACHE_KEY}:${period}`;

  try {
    const data = bust
      ? await buildExcellenceScores(period)
      : await (async () => {
          const hit = await getCached(key);
          if (hit) return hit;
          const fresh = await buildExcellenceScores(period);
          await setCached(key, fresh, CACHE_TTL);
          return fresh;
        })();

    res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[excellence-scores]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
