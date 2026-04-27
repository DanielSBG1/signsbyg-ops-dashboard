import React, { useState } from 'react';

const FIELD_LABELS = {
  pm_name: 'PM',
  sbg_scope_of_work: 'Scope',
  contact: 'Contact',
  amount: 'Amount',
  street_address: 'Address',
  contract_url: 'Contract',
  drawing_url: 'Drawing',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS);

function Check() {
  return <span className="text-success text-lg">&#10003;</span>;
}

function Cross() {
  return <span className="text-danger text-lg">&#10007;</span>;
}

function SummaryCards({ summary }) {
  if (!summary) return null;

  const completenessColor =
    summary.avgCompleteness >= 80 ? 'text-success' :
    summary.avgCompleteness >= 60 ? 'text-warning' : 'text-danger';

  const cards = [
    { label: 'Deals Handed Off', value: summary.totalDeals },
    { label: 'Avg Completeness', value: `${summary.avgCompleteness}%`, className: completenessColor },
    { label: 'Fully Complete', value: summary.fullyComplete, className: 'text-success' },
    { label: 'Incomplete', value: summary.incomplete, className: summary.incomplete > 0 ? 'text-danger' : '' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-slate-card border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-white/40 font-medium">{c.label}</span>
          <span className={`text-3xl font-bold tracking-tight ${c.className || ''}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function RepScorecard({ reps }) {
  if (!reps || reps.length === 0) return null;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Rep Scorecard</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/40 text-xs uppercase tracking-wider">
            <th className="pb-3 px-3 text-left">Rep</th>
            <th className="pb-3 px-3 text-right"># Deals</th>
            <th className="pb-3 px-3 text-right">Avg Completeness</th>
            <th className="pb-3 px-3 text-right"># Incomplete</th>
          </tr>
        </thead>
        <tbody>
          {reps.map((rep) => (
            <tr
              key={rep.id}
              className={`hover:bg-white/5 transition-colors ${
                rep.avgCompleteness < 70 ? 'border-l-4 border-l-danger' :
                rep.avgCompleteness < 90 ? 'border-l-4 border-l-warning' :
                'border-l-4 border-l-success'
              }`}
            >
              <td className="py-3 px-3 text-left font-medium">{rep.name}</td>
              <td className="py-3 px-3 text-right tabular-nums">{rep.deals}</td>
              <td className={`py-3 px-3 text-right tabular-nums font-medium ${
                rep.avgCompleteness >= 80 ? 'text-success' :
                rep.avgCompleteness >= 60 ? 'text-warning' : 'text-danger'
              }`}>
                {rep.avgCompleteness}%
              </td>
              <td className={`py-3 px-3 text-right tabular-nums ${rep.incompleteDeals > 0 ? 'text-danger' : ''}`}>
                {rep.incompleteDeals}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealTable({ deals }) {
  const [sortKey, setSortKey] = useState('completeness');
  const [sortDir, setSortDir] = useState('asc');

  if (!deals || deals.length === 0) return null;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'completeness' ? 'asc' : 'desc');
    }
  };

  const sorted = [...deals].sort((a, b) => {
    let av, bv;
    if (sortKey === 'completeness') {
      av = a.completeness; bv = b.completeness;
    } else if (sortKey === 'rep') {
      av = a.rep; bv = b.rep;
    } else if (sortKey === 'closeDate') {
      av = a.closeDate; bv = b.closeDate;
    } else if (sortKey === 'name') {
      av = a.name; bv = b.name;
    } else {
      av = a[sortKey]; bv = b[sortKey];
    }
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const SortHeader = ({ label, sortKeyName, align = 'right' }) => (
    <th
      onClick={() => handleSort(sortKeyName)}
      className={`pb-3 px-3 cursor-pointer hover:text-white/70 transition-colors ${
        align === 'left' ? 'text-left' : 'text-center'
      }`}
    >
      {label}
      {sortKey === sortKeyName && (
        <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
      )}
    </th>
  );

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Deal Details</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/40 text-xs uppercase tracking-wider">
            <SortHeader label="Deal" sortKeyName="name" align="left" />
            <SortHeader label="Rep" sortKeyName="rep" align="left" />
            <SortHeader label="Close Date" sortKeyName="closeDate" align="left" />
            {FIELD_KEYS.map((key) => (
              <th key={key} className="pb-3 px-2 text-center">{FIELD_LABELS[key]}</th>
            ))}
            <SortHeader label="Score" sortKeyName="completeness" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => (
            <tr
              key={deal.id}
              className={`hover:bg-white/5 transition-colors ${
                deal.completeness < 7 ? 'bg-danger/5' : ''
              }`}
            >
              <td className="py-3 px-3 text-left font-medium max-w-[200px] truncate">{deal.name}</td>
              <td className="py-3 px-3 text-left">{deal.rep}</td>
              <td className="py-3 px-3 text-left tabular-nums">{deal.closeDate}</td>
              {FIELD_KEYS.map((key) => (
                <td key={key} className="py-3 px-2 text-center">
                  {deal.fields[key] ? <Check /> : <Cross />}
                </td>
              ))}
              <td className={`py-3 px-3 text-center tabular-nums font-medium ${
                deal.completeness === 7 ? 'text-success' :
                deal.completeness >= 5 ? 'text-warning' : 'text-danger'
              }`}>
                {deal.completeness}/7
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Handoffs({ data, loading, error }) {
  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm">
          Failed to load data: {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-sm">Loading handoff data...</p>
          </div>
        </div>
      ) : data ? (
        <>
          <SummaryCards summary={data.summary} />
          <RepScorecard reps={data.reps} />
          <DealTable deals={data.deals} />
        </>
      ) : null}
    </div>
  );
}
