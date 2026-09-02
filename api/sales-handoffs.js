import { getClosedWonDealsInRange, getDealContactAssociationsBatch, getDealNoteAssociationsBatch, getNotesByIds, getOwners } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { CLOSED_WON_STAGES, DESIGNER_NAMES } from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'today', start: customStart, end: customEnd } = req.query;

    if (period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const cacheKey = `handoffsv1:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) { console.log(`[Cache HIT] ${cacheKey}`); return res.status(200).json(hit); }
    console.log(`[Cache MISS] ${cacheKey}`);

    const range = getDateRange(period, customStart, customEnd);

    const [dealsResult, owners] = await Promise.all([
      getClosedWonDealsInRange(range.start, range.end, CLOSED_WON_STAGES),
      getOwners(),
    ]);

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email;
    }

    // Batch-fetch contacts and notes for all deals (replaces N+1 per-deal calls)
    const dealIds = dealsResult.results.map((d) => d.id);

    const [contactAssocMap, noteAssocMap] = await Promise.all([
      getDealContactAssociationsBatch(dealIds).catch(() => new Map()),
      getDealNoteAssociationsBatch(dealIds).catch(() => new Map()),
    ]);

    // Collect all unique note IDs and batch-read their properties
    const allNoteIds = new Set();
    for (const ids of noteAssocMap.values()) {
      for (const id of ids) allNoteIds.add(id);
    }
    const noteObjects = await getNotesByIds([...allNoteIds]).catch(() => []);
    const noteById = new Map();
    for (const n of noteObjects) noteById.set(String(n.id), n);

    const deals = dealsResult.results.map((deal) => {
      const p = deal.properties;

      const hasContact = (contactAssocMap.get(String(deal.id)) || []).length > 0;
      const dealNoteIds = noteAssocMap.get(String(deal.id)) || [];
      const notes = dealNoteIds.map((id) => noteById.get(id)).filter(Boolean);

      const contractUrl = checkContractUrl(notes);
      const drawingUrl = checkDrawingUrl(notes);

      const fields = {
        pm_name: !!p.pm_name && p.pm_name.trim() !== '',
        sbg_scope_of_work: !!p.sbg_scope_of_work && p.sbg_scope_of_work.trim() !== '',
        contact: hasContact,
        amount: !!p.amount && parseFloat(p.amount) > 0,
        street_address: !!p.street_address && p.street_address.trim() !== '',
        contract_url: contractUrl,
        drawing_url: drawingUrl,
      };

      const completeness = Object.values(fields).filter(Boolean).length;

      return {
        id: deal.id,
        name: p.dealname || 'Unnamed Deal',
        rep: ownerMap[p.hubspot_owner_id] || `Owner ${p.hubspot_owner_id}`,
        repId: p.hubspot_owner_id || '',
        closeDate: p.closedate ? p.closedate.split('T')[0] : '',
        fields,
        completeness,
      };
    });

    // Aggregate summary
    const totalDeals = deals.length;
    const totalCompleteness = deals.reduce((sum, d) => sum + d.completeness, 0);
    const avgCompleteness = totalDeals > 0 ? Math.round((totalCompleteness / (totalDeals * 7)) * 100) : 0;
    const fullyComplete = deals.filter((d) => d.completeness === 7).length;
    const incomplete = totalDeals - fullyComplete;

    // Aggregate by rep
    const repMap = {};
    for (const deal of deals) {
      if (!repMap[deal.repId]) {
        repMap[deal.repId] = { id: deal.repId, name: deal.rep, deals: 0, totalCompleteness: 0, incompleteDeals: 0 };
      }
      repMap[deal.repId].deals += 1;
      repMap[deal.repId].totalCompleteness += deal.completeness;
      if (deal.completeness < 7) repMap[deal.repId].incompleteDeals += 1;
    }

    const reps = Object.values(repMap).map((r) => ({
      ...r,
      avgCompleteness: Math.round((r.totalCompleteness / (r.deals * 7)) * 100),
    }));
    reps.sort((a, b) => a.avgCompleteness - b.avgCompleteness);

    const result = {
      period: { start: range.start, end: range.end, label: range.label },
      summary: { totalDeals, avgCompleteness, fullyComplete, incomplete },
      reps,
      deals,
    };

    await setCached(cacheKey, result, 120);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Handoffs API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function checkContractUrl(notes) {
  for (const note of notes) {
    const body = (note.properties.hs_note_body || '').toLowerCase();
    if (body.includes('contract') && /https?:\/\/[^\s]+/.test(note.properties.hs_note_body || '')) {
      return true;
    }
  }
  return false;
}

function checkDrawingUrl(notes) {
  const designerNotes = notes.filter((n) => {
    const creator = (n.properties.hs_created_by_user_name || '').toLowerCase();
    return DESIGNER_NAMES.some((name) => creator.includes(name));
  });
  // Sort newest first
  designerNotes.sort((a, b) => new Date(b.properties.hs_createdate) - new Date(a.properties.hs_createdate));
  if (designerNotes.length === 0) return false;
  const body = designerNotes[0].properties.hs_note_body || '';
  return /https?:\/\/[^\s]+/.test(body);
}
