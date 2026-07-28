import React, { useMemo, useState, useEffect } from 'react';

/* ── Formatting helpers ───────────────────────────── */

function fmtCurrency(v) {
  if (v == null) return '$0';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtTime(minutes) {
  if (minutes == null) return '\u2014';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtPercent(v) {
  if (v == null) return '0%';
  return `${v}%`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function responseTimeColor(minutes) {
  if (minutes == null) return 'text-white/40';
  if (minutes <= 5) return 'text-success';
  if (minutes <= 60) return 'text-warning';
  if (minutes <= 240) return 'text-orange-400';
  return 'text-danger';
}

function truncate(str, len = 32) {
  if (!str) return '\u2014';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

/* ── Stat module card ─────────────────────────────── */

function StatModule({ label, value, valueClass, subline, subline2 }) {
  return (
    <div className="bg-white/5 rounded-xl p-6 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{label}</span>
      <span className={`text-4xl font-bold tabular-nums ${valueClass || 'text-white'}`}>{value}</span>
      {subline && <span className="text-sm text-white/40">{subline}</span>}
      {subline2 && <span className="text-xs text-white/25">{subline2}</span>}
    </div>
  );
}

/* ── Status badge ─────────────────────────────────── */

function StatusBadge({ status }) {
  const lower = (status || '').toLowerCase();
  let colorClass = 'bg-accent/20 text-accent';
  let label = 'Open';
  if (lower === 'won' || lower === 'closedwon' || lower === 'closed won') { colorClass = 'bg-success/20 text-success'; label = 'Won'; }
  else if (lower === 'lost' || lower === 'closedlost' || lower === 'closed lost') { colorClass = 'bg-danger/20 text-danger'; label = 'Lost'; }
  return <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${colorClass}`}>{label}</span>;
}

/* ── Sortable column header ───────────────────────── */

function SortHeader({ label, sortKey, currentSort, currentDir, onSort, align }) {
  const isActive = currentSort === sortKey;
  const arrow = isActive ? (currentDir === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <th className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-white/60 transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${isActive ? 'text-accent' : ''}`} onClick={() => onSort(sortKey)}>{label}{arrow}</th>
  );
}

/* ── Main component ─────────────────────────────── */

export default function RepScorecard({ reps, selectedRepId, onSelectRep, periodDeals }) {
  const rep = useMemo(() => (reps || []).find((r) => r.id === selectedRepId) || null, [reps, selectedRepId]);
  const repDeals = useMemo(() => { if (!periodDeals || !rep) return []; return periodDeals.filter((d) => d.ownerId === rep.id); }, [periodDeals, rep]);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [sortKey, setSortKey] = useState('createdate');
  const [sortDir, setSortDir] = useState('desc');
  useEffect(() => { setShowAllDeals(false); setSortKey('createdate'); setSortDir('desc'); }, [selectedRepId]);

  function handleSort(key) { if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); } }

  const sortedDeals = useMemo(() => {
    const deals = [...repDeals];
    deals.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'name': av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'stage': av = (a.stageLabel || a.stage || '').toLowerCase(); bv = (b.stageLabel || b.stage || '').toLowerCase(); return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'amount': av = a.amount || 0; bv = b.amount || 0; return sortDir === 'asc' ? av - bv : bv - av;
        case 'status': const order = { won: 0, open: 1, lost: 2 }; av = order[a.status] ?? 1; bv = order[b.status] ?? 1; return sortDir === 'asc' ? av - bv : bv - av;
        case 'createdate': default: av = a.createdate || ''; bv = b.createdate || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
    });
    return deals;
  }, [repDeals, sortKey, sortDir]);

  const visibleDeals = useMemo(() => (showAllDeals ? sortedDeals : sortedDeals.slice(0, 10)), [sortedDeals, showAllDeals]);

  if (!reps || reps.length === 0) return <div className="bg-slate-card border border-white/5 rounded-2xl p-6"><p className="text-white/40 text-sm text-center">No rep data available.</p></div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {reps.map((r) => {
          const isActive = r.id === selectedRepId;
          return <button key={r.id} onClick={() => onSelectRep(r.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive ? 'bg-accent text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{r.name}</button>;
        })}
      </div>

      {!rep && <div className="bg-slate-card border border-white/5 rounded-2xl p-12 flex items-center justify-center"><p className="text-white/30 text-sm">Select a rep to view their scorecard</p></div>}

      {rep && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatModule label="BIDS SENT" value={rep.bidsSent ?? 0} valueClass="text-accent" subline={`${rep.samePeriodBidsSent ?? 0} same-period`} subline2="Deals created & bid sent in this period" />
            <StatModule label="LEADS GENERATED" value={rep.leadsAssigned ?? 0} subline={`${rep.fbLeads ?? 0} FB / ${rep.organicLeads ?? 0} Organic / ${rep.referralLeads ?? 0} Referral / ${rep.coldLeads ?? 0} Cold`} subline2={`${rep.contactsAssigned ?? 0} total contacts`} />
            <StatModule label="DEALS WON" value={rep.dealsWon ?? 0} valueClass={(rep.dealsWon ?? 0) > 0 ? 'text-success' : 'text-white'} subline={`${rep.dealsCreated ?? 0} created in period`} />
            <StatModule label="REVENUE CLOSED" value={fmtCurrency(rep.revenueClosed)} valueClass="text-success" subline={`Avg deal: ${fmtCurrency(rep.cohortAvgDealSize || rep.activityAvgDealSize)}`} />
            <StatModule label="AVG RESPONSE TIME" value={fmtTime(rep.avgResponseMinutes)} valueClass={responseTimeColor(rep.avgResponseMinutes)} subline="From lead creation to first contact" />
            <StatModule label="CONVERSION RATE" value={fmtPercent(rep.conversionRate)} subline={`Win rate: ${fmtPercent(rep.cohortWinRate)}`} subline2={`${rep.cohortDeals ?? 0} deals from ${rep.leadsAssigned ?? 0} leads`} />
          </div>

          <div className="bg-white/5 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-white/70 font-medium">Bid Pipeline: <span className="text-accent font-bold">{fmtCurrency(rep.bidsRevenue)}</span></span>
            <span className="text-sm text-white/40">Avg Lead \u2192 Bid: <span className="text-white/70 tabular-nums font-medium">{fmtTime(rep.avgTimeToBidMinutes)}</span></span>
          </div>

          {repDeals.length > 0 && (
            <div className="bg-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/5">
                    <SortHeader label="Deal" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Stage" sortKey="stage" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Date" sortKey="createdate" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Amount" sortKey="amount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {visibleDeals.map((deal, idx) => (
                    <tr key={deal.id || idx} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-white/80">{deal.hubspotUrl ? <a href={deal.hubspotUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors" title={deal.name}>{truncate(deal.name)}</a> : truncate(deal.name)}</td>
                      <td className="px-4 py-3 text-white/50">{deal.stageLabel || deal.stage || '\u2014'}</td>
                      <td className="px-4 py-3 text-white/40 tabular-nums text-xs">{fmtDate(deal.createdate)}</td>
                      <td className="px-4 py-3 text-white/80 tabular-nums text-right font-medium">{fmtCurrency(deal.amount)}</td>
                      <td className="px-4 py-3 text-right"><StatusBadge status={deal.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!showAllDeals && repDeals.length > 10 && (
                <div className="px-4 py-3 border-t border-white/5">
                  <button onClick={() => setShowAllDeals(true)} className="text-accent text-sm hover:text-accent/80 transition-colors font-medium">Show all {repDeals.length} deals</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
