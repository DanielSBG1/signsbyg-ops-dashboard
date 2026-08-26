import { neon } from '@neondatabase/serverless';
import { getCached, setCached } from './_lib/cache.js';

const CACHE_TTL = 900; // 15 minutes

/**
 * Compute the date range for a given preset.
 *   month   = last 30 days
 *   quarter = last 90 days
 *   year    = Jan 1 of current year to today
 */
function getDateRange(preset) {
  const now = new Date();
  const end = now.toISOString().split('T')[0]; // YYYY-MM-DD

  if (preset === 'year') {
    const start = `${now.getFullYear()}-01-01`;
    return { start, end };
  }

  const days = preset === 'quarter' ? 90 : 30;
  const startDate = new Date(now.getTime() - days * 86400000);
  const start = startDate.toISOString().split('T')[0];
  return { start, end };
}

/**
 * Query the Meta Ads Neon database and return totals, monthlyPnl, campaigns,
 * and adSets for the ops dashboard.
 *
 * Revenue attribution uses CONTACT CREATION DATE, not deal close date.
 */
async function fetchMetaAdsMetrics(preset) {
  const url = process.env.META_ADS_DATABASE_URL;
  if (!url) throw new Error('META_ADS_DATABASE_URL is not configured');

  const sql = neon(url);
  const { start, end } = getDateRange(preset);

  // Run all four queries in parallel
  const [totalsRows, monthlyRows, campaignRows, adSetRows] = await Promise.all([
    // 1. Totals
    sql`
      with perf as (
        select
          coalesce(sum(spend), 0)       as spend,
          coalesce(sum(results), 0)     as meta_leads,
          coalesce(sum(link_clicks), 0) as link_clicks,
          coalesce(sum(impressions), 0) as impressions
        from ad_insights_daily
        where spend_category = 'meta_ads'
          and day between ${start}::date and ${end}::date
      ),
      hs_leads as (
        select coalesce(sum(leads), 0) as leads
        from hs_campaign_leads_monthly
        where month between to_char(${start}::date, 'YYYY-MM')
                        and to_char(${end}::date, 'YYYY-MM')
      ),
      rev as (
        select
          coalesce(sum(d.amount::numeric * al.weight::numeric), 0) as revenue,
          count(distinct d.id) as deals
        from attribution_links al
        join hs_deals d on d.id = al.deal_id
        join deal_contacts dc on dc.deal_id = d.id
        join hs_contacts c on c.id = dc.contact_id
        where d.is_closed_won = true
          and al.spend_category = 'meta_ads'
          and c.created_at::date between ${start}::date and ${end}::date
      )
      select
        p.spend,
        p.meta_leads,
        p.link_clicks,
        p.impressions,
        l.leads   as hubspot_leads,
        r.revenue as attributed_revenue,
        r.deals
      from perf p, hs_leads l, rev r
    `,

    // 2. Monthly P&L (grouped by contact created_at month)
    sql`
      with spend as (
        select to_char(day, 'YYYY-MM') as month,
               sum(spend) filter (where spend_category = 'meta_ads')     as meta_spend,
               sum(spend) filter (where spend_category = 'boosted_post') as boosted_spend
        from ad_insights_daily
        where day between ${start}::date and ${end}::date
        group by 1
      ),
      revenue as (
        select to_char(c.created_at, 'YYYY-MM') as month,
               sum(d.amount::numeric * al.weight::numeric) as revenue,
               count(distinct d.id) as deals
        from attribution_links al
        join hs_deals d on d.id = al.deal_id
        join deal_contacts dc on dc.deal_id = d.id
        join hs_contacts c on c.id = dc.contact_id
        where d.is_closed_won = true
          and al.spend_category = 'meta_ads'
          and c.created_at::date between ${start}::date and ${end}::date
        group by 1
      ),
      leads as (
        select month, sum(leads) as leads
        from hs_campaign_leads_monthly
        where month between to_char(${start}::date, 'YYYY-MM')
                        and to_char(${end}::date, 'YYYY-MM')
        group by 1
      ),
      all_months as (
        select month from spend
        union select month from revenue
        union select month from leads
      )
      select m.month,
             coalesce(s.meta_spend, 0)    as meta_spend,
             coalesce(s.boosted_spend, 0) as boosted_spend,
             coalesce(l.leads, 0)         as hubspot_leads,
             coalesce(r.revenue, 0)       as revenue,
             coalesce(r.deals, 0)         as deals
      from all_months m
      left join spend s   on s.month = m.month
      left join revenue r on r.month = m.month
      left join leads l   on l.month = m.month
      where m.month is not null
      order by m.month asc
    `,

    // 3. Campaigns (with CRM outcome)
    sql`
      with perf as (
        select i.campaign_id,
               c.name,
               sum(i.spend)               as spend,
               sum(i.results)             as meta_leads,
               sum(i.impressions)         as impressions,
               sum(i.link_clicks)         as link_clicks
        from ad_insights_daily i
        join campaigns c on c.id = i.campaign_id
        where i.spend_category = 'meta_ads'
          and i.day between ${start}::date and ${end}::date
        group by i.campaign_id, c.name
      ),
      leads as (
        select lower(campaign_name) as campaign_name_lc,
               sum(leads) as leads
        from hs_campaign_leads_monthly
        where month between to_char(${start}::date, 'YYYY-MM')
                        and to_char(${end}::date, 'YYYY-MM')
        group by 1
      ),
      rev as (
        select al.campaign_id,
               coalesce(sum(d.amount::numeric * al.weight::numeric), 0) as revenue,
               count(distinct d.id) as deals
        from attribution_links al
        join hs_deals d on d.id = al.deal_id
        join deal_contacts dc on dc.deal_id = d.id
        join hs_contacts c on c.id = dc.contact_id
        where d.is_closed_won = true
          and al.spend_category = 'meta_ads'
          and c.created_at::date between ${start}::date and ${end}::date
        group by al.campaign_id
      )
      select perf.campaign_id,
             perf.name,
             coalesce(perf.spend, 0)       as spend,
             coalesce(perf.meta_leads, 0)  as meta_leads,
             coalesce(perf.impressions, 0) as impressions,
             coalesce(perf.link_clicks, 0) as link_clicks,
             coalesce(leads.leads, 0)      as hubspot_leads,
             coalesce(rev.revenue, 0)      as revenue,
             coalesce(rev.deals, 0)        as deals
      from perf
      left join leads on lower(leads.campaign_name_lc) = lower(perf.name)
      left join rev   on rev.campaign_id = perf.campaign_id
      order by perf.spend desc
    `,

    // 4. Ad Sets
    sql`
      select i.ad_set_id,
             s.name,
             c.name                          as campaign_name,
             coalesce(sum(i.spend), 0)       as spend,
             coalesce(sum(i.results), 0)     as meta_leads,
             coalesce(sum(i.link_clicks), 0) as link_clicks,
             coalesce(sum(i.impressions), 0) as impressions
      from ad_insights_daily i
      join ad_sets s   on s.id = i.ad_set_id
      join campaigns c on c.id = i.campaign_id
      where i.spend_category = 'meta_ads'
        and i.day between ${start}::date and ${end}::date
      group by i.ad_set_id, s.name, c.name
      order by sum(i.results) desc
    `,
  ]);

  // --- Shape results ---

  // Totals
  const t = totalsRows[0] || {};
  const spend = Number(t.spend || 0);
  const metaLeads = Number(t.meta_leads || 0);
  const hubspotLeads = Number(t.hubspot_leads || 0);
  const attributedRevenue = Number(t.attributed_revenue || 0);
  const deals = Number(t.deals || 0);
  const linkClicks = Number(t.link_clicks || 0);
  const impressions = Number(t.impressions || 0);
  const linkCtr = impressions > 0
    ? Math.round((linkClicks / impressions) * 10000) / 100
    : 0;

  const totals = {
    spend,
    metaLeads,
    costPerLead: metaLeads > 0 ? Math.round((spend / metaLeads) * 100) / 100 : 0,
    hubspotLeads,
    attributedRevenue,
    deals,
    linkClicks,
    impressions,
    linkCtr,
  };

  // Monthly P&L
  const monthlyPnl = monthlyRows.map((r) => ({
    month: r.month,
    metaSpend: Number(r.meta_spend || 0),
    boostedSpend: Number(r.boosted_spend || 0),
    hubspotLeads: Number(r.hubspot_leads || 0),
    revenue: Number(r.revenue || 0),
    deals: Number(r.deals || 0),
  }));

  // Campaigns
  const campaigns = campaignRows.map((r) => ({
    campaignId: r.campaign_id,
    name: r.name,
    spend: Number(r.spend || 0),
    metaLeads: Number(r.meta_leads || 0),
    hubspotLeads: Number(r.hubspot_leads || 0),
    revenue: Number(r.revenue || 0),
    deals: Number(r.deals || 0),
    linkClicks: Number(r.link_clicks || 0),
    impressions: Number(r.impressions || 0),
  }));

  // Ad Sets
  const adSets = adSetRows.map((r) => ({
    adSetId: r.ad_set_id,
    name: r.name,
    campaignName: r.campaign_name,
    spend: Number(r.spend || 0),
    metaLeads: Number(r.meta_leads || 0),
    linkClicks: Number(r.link_clicks || 0),
    impressions: Number(r.impressions || 0),
  }));

  return {
    period: { start, end, preset },
    totals,
    monthlyPnl,
    campaigns,
    adSets,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { preset = 'month', nocache } = req.query;

    if (!['month', 'quarter', 'year'].includes(preset)) {
      return res.status(400).json({ ok: false, error: 'Invalid preset. Use month, quarter, or year.' });
    }

    const forceRefresh = nocache === '1';
    const cacheKey = `meta-ads:v1:${preset}`;

    if (!forceRefresh) {
      const hit = await getCached(cacheKey);
      if (hit) {
        console.log(`[meta-ads-metrics] Cache HIT ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.status(200).json({ ok: true, data: hit });
      }
    }

    console.log(`[meta-ads-metrics] Cache ${forceRefresh ? 'BYPASS' : 'MISS'} ${cacheKey}`);
    const data = await fetchMetaAdsMetrics(preset);

    await setCached(cacheKey, data, CACHE_TTL);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('[meta-ads-metrics] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
