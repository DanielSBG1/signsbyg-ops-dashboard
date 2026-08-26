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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const url = process.env.META_ADS_DATABASE_URL;
    if (!url) throw new Error('META_ADS_DATABASE_URL is not configured');

    const sql = neon(url);
    const { preset = 'year', campaignId, adSetId, mode } = req.query;

    // Date range
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start;
    if (preset === 'year') start = `${now.getFullYear()}-01-01`;
    else if (preset === 'quarter') start = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    else start = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

    // Expand to full months for cohort attribution
    const pnlStart = start.slice(0, 7) + '-01';
    const endDate = new Date(end + 'T12:00:00Z');
    const lastDay = new Date(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0);
    const pnlEnd = lastDay.toISOString().slice(0, 10);

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
        and ct.created_at::date between ${pnlStart}::date and ${pnlEnd}::date
        ${campaignId ? sql`and al.campaign_id = ${campaignId}` : sql``}
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

    // Repeat customers: contacts with 2+ closed-won deals
    let repeatCustomers = [];
    if (mode === 'repeats') {
      const repeatRows = await sql`
        select c.id as contact_id, c.source_detail,
               json_agg(json_build_object(
                 'dealId', d.id,
                 'name', d.name,
                 'amount', d.amount::numeric,
                 'pipeline', d.pipeline,
                 'closeDate', d.close_date,
                 'rep', o.name,
                 'campaignId', al.campaign_id,
                 'campaignName', camp.name,
                 'adSetId', ml.ad_set_id,
                 'adSetName', adset.name
               ) order by d.close_date) as deals,
               count(distinct d.id) as deal_count,
               sum(d.amount::numeric) as total_revenue
        from hs_contacts c
        join deal_contacts dc on dc.contact_id = c.id
        join hs_deals d on d.id = dc.deal_id
        left join hs_owners o on o.id = d.owner_id
        left join attribution_links al on al.deal_id = d.id
        left join campaigns camp on camp.id = al.campaign_id
        left join meta_leads ml on ml.matched_contact_id = c.id
        left join ad_sets adset on adset.id = ml.ad_set_id
        where d.is_closed_won = true
          and c.analytics_source = 'PAID_SOCIAL'
        group by c.id, c.source_detail
        having count(distinct d.id) > 1
        order by sum(d.amount::numeric) desc
      `;

      repeatCustomers = repeatRows.map(r => ({
        contactId: r.contact_id,
        source: r.source_detail || 'Paid Social',
        dealCount: Number(r.deal_count),
        totalRevenue: Number(r.total_revenue || 0),
        deals: (r.deals || []).map(d => ({
          dealId: d.dealId,
          name: d.name,
          amount: Number(d.amount || 0),
          pipeline: PIPELINE_NAMES[d.pipeline] || d.pipeline || 'Unknown',
          closeDate: d.closeDate ? new Date(d.closeDate).toISOString().slice(0, 10) : null,
          rep: d.rep || 'Unassigned',
          campaignName: d.campaignName || null,
          adSetName: d.adSetName || null,
        })),
      }));
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
    return res.status(500).json({ ok: false, error: err.message });
  }
}
