import { neon } from '@neondatabase/serverless';

/**
 * Deal drill-down for the Meta Ads section.
 * Returns individual deals grouped by pipeline, with rep names.
 * Called when user clicks on a revenue number.
 *
 * Query params:
 *   preset=month|quarter|year (default: year)
 *   campaignId=... (optional, filter to one campaign)
 *   adSetId=...   (optional, filter to one ad set)
 */
export default async function handler(req, res) {
  // No CORS header — same-origin only
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const url = process.env.META_ADS_DATABASE_URL;
    if (!url) throw new Error('META_ADS_DATABASE_URL is not configured');

    const sql = neon(url);
    const { preset = 'year', campaignId, adSetId, mode, dateView } = req.query;
    const useClosed = dateView === 'closed';

    // Calendar date range — matches meta-ads-metrics.js exactly
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    let pnlStart, pnlEnd;
    if (preset === 'year') {
      pnlStart = `${y}-01-01`;
      pnlEnd = `${y}-12-31`;
    } else if (preset === 'quarter') {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd = qStart + 2;
      const qLastDay = new Date(y, qEnd + 1, 0).getDate();
      pnlStart = `${y}-${String(qStart + 1).padStart(2, '0')}-01`;
      pnlEnd = `${y}-${String(qEnd + 1).padStart(2, '0')}-${String(qLastDay).padStart(2, '0')}`;
    } else {
      const mLastDay = new Date(y, m + 1, 0).getDate();
      pnlStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      pnlEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(mLastDay).padStart(2, '0')}`;
    }

    // Pipeline name mapping (HubSpot pipeline IDs to friendly names)
    // These are fetched dynamically but we'll also maintain a fallback map
    const PIPELINE_NAMES = {
      'default': 'Sales Pipeline',
      '99067273': 'GC Pipeline',
      '99069236': 'National Accounts',
      '98976863': 'Government',
    };

    // Fetch deals with attribution
    const deals = await sql`
      select d.id as deal_id,
             d.name as deal_name,
             d.pipeline,
             d.stage,
             d.amount::numeric as amount,
             d.close_date,
             d.owner_id,
             o.name as rep_name,
             al.campaign_id,
             c.name as campaign_name,
             al.weight,
             al.level,
             al.spend_category,
             ct.created_at as lead_created_at,
             ct.source_detail as lead_source,
             ml.ad_set_id,
             adset.name as ad_set_name
      from attribution_links al
      join hs_deals d on d.id = al.deal_id
      left join hs_owners o on o.id = d.owner_id
      left join campaigns c on c.id = al.campaign_id
      join deal_contacts dc on dc.deal_id = d.id
      join hs_contacts ct on ct.id = dc.contact_id
      left join meta_leads ml on ml.matched_contact_id = ct.id
      left join ad_sets adset on adset.id = ml.ad_set_id
      where d.is_closed_won = true
        and al.spend_category = 'meta_ads'
        and ${useClosed ? sql`d.close_date::date` : sql`ct.created_at::date`} between ${pnlStart}::date and ${pnlEnd}::date
        ${campaignId ? sql`and al.campaign_id = ${campaignId}` : sql``}
        ${adSetId ? sql`and ml.ad_set_id = ${adSetId}` : sql``}
      order by d.amount::numeric desc
    `;

    // Group by pipeline
    const byPipeline = {};
    const seen = new Set(); // dedupe deals that appear multiple times from multi-contact attribution

    for (const d of deals) {
      const key = d.deal_id;
      if (seen.has(key)) continue;
      seen.add(key);

      const pipelineId = d.pipeline || 'default';
      const pipelineName = PIPELINE_NAMES[pipelineId] || pipelineId;

      if (!byPipeline[pipelineName]) {
        byPipeline[pipelineName] = { pipeline: pipelineName, pipelineId, deals: [], totalRevenue: 0 };
      }

      const amount = Number(d.amount || 0);
      const daysToClose = d.lead_created_at && d.close_date
        ? Math.round((new Date(d.close_date) - new Date(d.lead_created_at)) / 86400000)
        : null;

      byPipeline[pipelineName].deals.push({
        dealId: d.deal_id,
        name: d.deal_name,
        amount,
        rep: d.rep_name || 'Unassigned',
        closeDate: d.close_date ? new Date(d.close_date).toISOString().slice(0, 10) : null,
        leadCreatedAt: d.lead_created_at ? new Date(d.lead_created_at).toISOString().slice(0, 10) : null,
        campaign: d.campaign_name || 'Paid Social (unresolved)',
        adSet: d.ad_set_name || null,
        daysToClose,
        level: d.level,
      });
      byPipeline[pipelineName].totalRevenue += amount;
    }

    // Sort pipelines by revenue desc
    const pipelines = Object.values(byPipeline).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Repeat customers: contacts with 2+ closed-won deals — single query, no N+1
    let repeatCustomers = [];
    if (mode === 'repeats') {
      const repeatRows = await sql`
        with repeat_contacts as (
          select c.id as contact_id, c.source_detail, c.created_at as lead_created_at
          from hs_contacts c
          join deal_contacts dc on dc.contact_id = c.id
          join hs_deals d on d.id = dc.deal_id
          where d.is_closed_won = true
            and c.analytics_source = 'PAID_SOCIAL'
          group by c.id, c.source_detail, c.created_at
          having count(distinct d.id) > 1
        ),
        deal_detail as (
          select distinct on (d.id, rc.contact_id)
                 rc.contact_id,
                 rc.source_detail,
                 rc.lead_created_at,
                 d.id as deal_id,
                 d.name,
                 d.amount::numeric as amount,
                 d.pipeline,
                 d.close_date,
                 o.name as rep,
                 (select camp.name from attribution_links al
                  join campaigns camp on camp.id = al.campaign_id
                  where al.deal_id = d.id limit 1) as campaign_name,
                 (select adset.name from meta_leads ml
                  join ad_sets adset on adset.id = ml.ad_set_id
                  where ml.matched_contact_id = rc.contact_id limit 1) as ad_set_name
          from repeat_contacts rc
          join deal_contacts dc on dc.contact_id = rc.contact_id
          join hs_deals d on d.id = dc.deal_id
          left join hs_owners o on o.id = d.owner_id
          where d.is_closed_won = true
          order by d.id, rc.contact_id, d.close_date
        )
        select * from deal_detail order by contact_id, close_date
      `;

      // Group rows by contact
      const byContact = {};
      for (const r of repeatRows) {
        if (!byContact[r.contact_id]) {
          byContact[r.contact_id] = {
            contactId: r.contact_id,
            source: r.source_detail || 'Paid Social',
            leadCreatedAt: r.lead_created_at ? new Date(r.lead_created_at).toISOString().slice(0, 10) : null,
            deals: [],
            totalRevenue: 0,
          };
        }
        const entry = byContact[r.contact_id];
        const amt = Number(r.amount || 0);
        entry.deals.push({
          dealId: r.deal_id,
          name: r.name,
          amount: amt,
          pipeline: PIPELINE_NAMES[r.pipeline] || r.pipeline || 'Unknown',
          closeDate: r.close_date ? new Date(r.close_date).toISOString().slice(0, 10) : null,
          rep: r.rep || 'Unassigned',
          campaignName: r.campaign_name || null,
          adSetName: r.ad_set_name || null,
        });
        entry.totalRevenue += amt;
      }
      repeatCustomers = Object.values(byContact)
        .map(c => ({ ...c, dealCount: c.deals.length }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    return res.status(200).json({
      ok: true,
      data: {
        period: { start: pnlStart, end: pnlEnd, preset },
        totalDeals: seen.size,
        totalRevenue: pipelines.reduce((s, p) => s + p.totalRevenue, 0),
        pipelines,
        repeatCustomers,
      },
    });
  } catch (err) {
    console.error('[meta-ads-deals] Error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
