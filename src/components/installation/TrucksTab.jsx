import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/trucks';

const MAINTENANCE_TYPES = [
  { id: 'oil_change',   label: 'Oil Change' },
  { id: 'tires',        label: 'Tires' },
  { id: 'inspection',   label: 'Inspection' },
  { id: 'brakes',       label: 'Brakes' },
  { id: 'transmission', label: 'Transmission' },
  { id: 'other',        label: 'Other' },
];

const TYPE_LABELS = Object.fromEntries(MAINTENANCE_TYPES.map((t) => [t.id, t.label]));

const THRESHOLD_KEYS = [
  { id: 'oilChange',    label: 'Oil Change',   hasMiles: true,  hasMonths: true },
  { id: 'tires',        label: 'Tires',        hasMiles: true,  hasMonths: true },
  { id: 'inspection',   label: 'Inspection',   hasMiles: false, hasMonths: true },
  { id: 'brakes',       label: 'Brakes',       hasMiles: true,  hasMonths: true },
  { id: 'transmission', label: 'Transmission', hasMiles: true,  hasMonths: true },
];

const DEFAULT_THRESHOLDS = {
  oilChange: { miles: 5000, months: 6 },
  tires: { miles: 40000, months: 24 },
  inspection: { months: 12 },
  brakes: { miles: 30000, months: 18 },
  transmission: { miles: 60000, months: 36 },
};

// Maps threshold key → maintenance log type key
const THRESHOLD_TO_LOG_TYPE = {
  oilChange: 'oil_change',
  tires: 'tires',
  inspection: 'inspection',
  brakes: 'brakes',
  transmission: 'transmission',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function formatCurrency(val) {
  if (!val && val !== 0) return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-US');
}

/**
 * Compute maintenance status for a single threshold category.
 * Returns { lastDate, lastMiles, nextDate, nextMiles, status, daysUntil, milesUntil }
 */
function computeMaintenanceStatus(thresholdKey, threshold, logs, currentMiles) {
  const logType = THRESHOLD_TO_LOG_TYPE[thresholdKey];
  const relevant = (logs || [])
    .filter((l) => l.type === logType)
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  const last = relevant[0] || null;
  const today = todayISO();

  let nextDate = null;
  let nextMiles = null;
  let daysUntil = null;
  let milesUntil = null;

  if (last) {
    if (threshold.months) {
      nextDate = addMonths(last.date, threshold.months);
      daysUntil = daysBetween(today, nextDate);
    }
    if (threshold.miles) {
      nextMiles = last.miles + threshold.miles;
      milesUntil = nextMiles - currentMiles;
    }
  }

  // Determine status
  let status = 'unknown'; // no service history
  if (last) {
    const dateOverdue = nextDate && nextDate < today;
    const milesOverdue = nextMiles && currentMiles >= nextMiles;
    const dateDueSoon = nextDate && !dateOverdue && daysUntil <= 30;
    const milesDueSoon = nextMiles && !milesOverdue && milesUntil <= 500;

    if (dateOverdue || milesOverdue) {
      status = 'overdue';
    } else if (dateDueSoon || milesDueSoon) {
      status = 'due_soon';
    } else {
      status = 'ok';
    }
  }

  return {
    lastDate: last?.date || null,
    lastMiles: last?.miles ?? null,
    nextDate,
    nextMiles,
    status,
    daysUntil,
    milesUntil,
  };
}

/**
 * Get the overall maintenance status for a truck given its logs.
 * Returns 'ok' | 'due_soon' | 'overdue' | 'unknown'
 */
function getOverallStatus(truck, logs) {
  const statuses = THRESHOLD_KEYS.map((tk) => {
    const threshold = truck.thresholds?.[tk.id];
    if (!threshold) return 'unknown';
    return computeMaintenanceStatus(tk.id, threshold, logs, truck.currentMiles).status;
  });
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('due_soon')) return 'due_soon';
  if (statuses.every((s) => s === 'ok')) return 'ok';
  return 'unknown';
}

const STATUS_CONFIG = {
  ok:       { label: 'All Good',  cls: 'bg-success/20 text-success', dotCls: 'bg-success' },
  due_soon: { label: 'Due Soon',  cls: 'bg-warning/20 text-warning', dotCls: 'bg-warning' },
  overdue:  { label: 'Overdue',   cls: 'bg-danger/20 text-danger',   dotCls: 'bg-danger' },
  unknown:  { label: 'No History', cls: 'bg-white/10 text-white/40', dotCls: 'bg-white/20' },
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchJSON(url, opts) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Maintenance Status Card (inside truck profile) ──────────────────────────

function MaintenanceCard({ thresholdKey, threshold, logs, currentMiles }) {
  const info = computeMaintenanceStatus(thresholdKey, threshold, logs, currentMiles);
  const cfg = STATUS_CONFIG[info.status] || STATUS_CONFIG.unknown;
  const label = THRESHOLD_KEYS.find((t) => t.id === thresholdKey)?.label || thresholdKey;

  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{label}</p>
        <StatusBadge status={info.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/40 mb-0.5">Last Service</p>
          <p className="text-white font-medium">{formatDate(info.lastDate)}</p>
          {info.lastMiles != null && (
            <p className="text-white/50">{formatNumber(info.lastMiles)} mi</p>
          )}
        </div>
        <div>
          <p className="text-white/40 mb-0.5">Next Due</p>
          <p className="text-white font-medium">{formatDate(info.nextDate)}</p>
          {info.nextMiles != null && (
            <p className="text-white/50">{formatNumber(info.nextMiles)} mi</p>
          )}
        </div>
      </div>

      {info.status !== 'unknown' && (
        <div className="flex items-center gap-3 text-[11px]">
          {info.daysUntil != null && (
            <span className={info.daysUntil <= 0 ? 'text-danger font-semibold' : info.daysUntil <= 30 ? 'text-warning' : 'text-white/50'}>
              {info.daysUntil <= 0 ? `${Math.abs(info.daysUntil)}d overdue` : `${info.daysUntil}d remaining`}
            </span>
          )}
          {info.milesUntil != null && (
            <span className={info.milesUntil <= 0 ? 'text-danger font-semibold' : info.milesUntil <= 500 ? 'text-warning' : 'text-white/50'}>
              {info.milesUntil <= 0 ? `${formatNumber(Math.abs(info.milesUntil))} mi over` : `${formatNumber(info.milesUntil)} mi remaining`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sortable Log Table ──────────────────────────────────────────────────────

function LogTable({ logs }) {
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...logs];
    copy.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'cost' || sortKey === 'miles' || sortKey === 'hours') {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return copy;
  }, [logs, sortKey, sortAsc]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'date' ? false : true);
    }
  }

  const columns = [
    { key: 'date',   label: 'Date' },
    { key: 'type',   label: 'Type' },
    { key: 'miles',  label: 'Miles' },
    { key: 'hours',  label: 'Hours' },
    { key: 'cost',   label: 'Cost' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'notes',  label: 'Notes' },
  ];

  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-white/30 text-sm">
        No maintenance logs yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-left px-3 py-2.5 text-[11px] text-white/40 font-semibold uppercase tracking-widest cursor-pointer hover:text-white/70 transition-colors select-none"
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    <span className="text-accent">{sortAsc ? '\u2191' : '\u2193'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((log) => (
            <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2.5 text-white/80 tabular-nums whitespace-nowrap">{formatDate(log.date)}</td>
              <td className="px-3 py-2.5">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-medium">
                  {TYPE_LABELS[log.type] || log.type}
                </span>
              </td>
              <td className="px-3 py-2.5 text-white/70 tabular-nums">{formatNumber(log.miles)}</td>
              <td className="px-3 py-2.5 text-white/70 tabular-nums">{formatNumber(log.hours)}</td>
              <td className="px-3 py-2.5 text-white/70 tabular-nums">{formatCurrency(log.cost)}</td>
              <td className="px-3 py-2.5 text-white/60 max-w-[120px] truncate">{log.vendor || '—'}</td>
              <td className="px-3 py-2.5 text-white/50 max-w-[180px] truncate">{log.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Log Entry Form ──────────────────────────────────────────────────────

function AddLogForm({ truckId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    type: 'oil_change',
    date: todayISO(),
    miles: '',
    hours: '',
    cost: '',
    vendor: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchJSON(`${API_BASE}/${truckId}/log`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onSaved();
    } catch (err) {
      console.error('Failed to save log entry:', err);
      alert('Failed to save log entry: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-white">Add Maintenance Entry</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Type</span>
          <select
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          >
            {MAINTENANCE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Miles</span>
          <input
            type="number"
            value={form.miles}
            onChange={(e) => update('miles', e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Hours</span>
          <input
            type="number"
            value={form.hours}
            onChange={(e) => update('hours', e.target.value)}
            placeholder="0"
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Cost ($)</span>
          <input
            type="number"
            step="0.01"
            value={form.cost}
            onChange={(e) => update('cost', e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Vendor</span>
          <input
            type="text"
            value={form.vendor}
            onChange={(e) => update('vendor', e.target.value)}
            placeholder="e.g. Jiffy Lube"
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>

        <label className="space-y-1 col-span-2 md:col-span-1">
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Notes</span>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Optional notes..."
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Entry'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white/5 text-white/60 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Add/Edit Truck Form ─────────────────────────────────────────────────────

function TruckForm({ truck, onSaved, onCancel }) {
  const isEdit = !!truck;
  const [form, setForm] = useState({
    name: truck?.name || '',
    vin: truck?.vin || '',
    year: truck?.year || '',
    make: truck?.make || '',
    model: truck?.model || '',
    licensePlate: truck?.licensePlate || '',
    currentMiles: truck?.currentMiles ?? '',
    currentHours: truck?.currentHours ?? '',
    thresholds: truck?.thresholds || DEFAULT_THRESHOLDS,
  });
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateThreshold(key, field, value) {
    setForm((prev) => ({
      ...prev,
      thresholds: {
        ...prev.thresholds,
        [key]: { ...prev.thresholds[key], [field]: Number(value) || 0 },
      },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Truck name is required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await fetchJSON(`${API_BASE}/${truck.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await fetchJSON(API_BASE, {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      onSaved();
    } catch (err) {
      console.error('Failed to save truck:', err);
      alert('Failed to save truck: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-card border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Truck' : 'Add Truck'}</h2>
          <button type="button" onClick={onCancel} className="text-white/40 hover:text-white/70 text-xl leading-none">&times;</button>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Name *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Truck 1"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">VIN</span>
            <input
              type="text"
              value={form.vin}
              onChange={(e) => update('vin', e.target.value)}
              placeholder="Vehicle identification number"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Year</span>
            <input
              type="text"
              value={form.year}
              onChange={(e) => update('year', e.target.value)}
              placeholder="2024"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Make</span>
            <input
              type="text"
              value={form.make}
              onChange={(e) => update('make', e.target.value)}
              placeholder="e.g. Ford"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Model</span>
            <input
              type="text"
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="e.g. F-250"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">License Plate</span>
            <input
              type="text"
              value={form.licensePlate}
              onChange={(e) => update('licensePlate', e.target.value)}
              placeholder="ABC-1234"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Current Miles</span>
            <input
              type="number"
              value={form.currentMiles}
              onChange={(e) => update('currentMiles', e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Current Hours</span>
            <input
              type="number"
              value={form.currentHours}
              onChange={(e) => update('currentHours', e.target.value)}
              placeholder="0"
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
            />
          </label>
        </div>

        {/* Thresholds */}
        <div className="space-y-3">
          <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Maintenance Thresholds</p>
          <div className="space-y-2">
            {THRESHOLD_KEYS.map((tk) => (
              <div key={tk.id} className="flex items-center gap-3 bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-sm text-white/70 w-28 shrink-0">{tk.label}</span>
                {tk.hasMiles && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={form.thresholds[tk.id]?.miles ?? ''}
                      onChange={(e) => updateThreshold(tk.id, 'miles', e.target.value)}
                      className="w-20 bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-accent/50 focus:outline-none tabular-nums"
                    />
                    <span className="text-[10px] text-white/30">mi</span>
                  </label>
                )}
                {tk.hasMonths && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={form.thresholds[tk.id]?.months ?? ''}
                      onChange={(e) => updateThreshold(tk.id, 'months', e.target.value)}
                      className="w-16 bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-accent/50 focus:outline-none tabular-nums"
                    />
                    <span className="text-[10px] text-white/30">mo</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Truck'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-white/5 text-white/60 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Truck Card (grid item) ────────────────────────────────────────────────────

function TruckCard({ truck, logs, onClick }) {
  const status = getOverallStatus(truck, logs);
  const cfg = STATUS_CONFIG[status];
  const ymm = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-card border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all duration-150 space-y-3 group"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-white group-hover:text-white/90 truncate">{truck.name}</p>
          {ymm && <p className="text-xs text-white/40 mt-0.5 truncate">{ymm}</p>}
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex items-center gap-4">
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Miles</p>
          <p className="text-lg font-bold text-white tabular-nums">{formatNumber(truck.currentMiles)}</p>
        </div>
        <div className="w-px h-8 bg-white/[0.08]" />
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Hours</p>
          <p className="text-lg font-bold text-white tabular-nums">{formatNumber(truck.currentHours)}</p>
        </div>
      </div>

      {truck.licensePlate && (
        <p className="text-[11px] text-white/25 font-mono tracking-wider">{truck.licensePlate}</p>
      )}
    </button>
  );
}

// ─── Truck Profile View ──────────────────────────────────────────────────────

function TruckProfile({ truckId, onBack }) {
  const [truck, setTruck] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLog, setShowAddLog] = useState(false);
  const [showEditTruck, setShowEditTruck] = useState(false);
  const [editMiles, setEditMiles] = useState('');
  const [editHours, setEditHours] = useState('');
  const [savingOdometer, setSavingOdometer] = useState(false);

  const loadTruck = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJSON(`${API_BASE}/${truckId}`);
      setTruck(data);
      setLogs(data.logs || []);
      setEditMiles(String(data.currentMiles ?? 0));
      setEditHours(String(data.currentHours ?? 0));
    } catch (err) {
      console.error('Failed to load truck:', err);
    } finally {
      setLoading(false);
    }
  }, [truckId]);

  useEffect(() => { loadTruck(); }, [loadTruck]);

  async function handleSaveOdometer() {
    setSavingOdometer(true);
    try {
      await fetchJSON(`${API_BASE}/${truckId}`, {
        method: 'PUT',
        body: JSON.stringify({
          currentMiles: Number(editMiles) || 0,
          currentHours: Number(editHours) || 0,
        }),
      });
      await loadTruck();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSavingOdometer(false);
    }
  }

  async function handleDeleteTruck() {
    if (!confirm(`Delete "${truck.name}"? This cannot be undone.`)) return;
    try {
      await fetchJSON(`${API_BASE}/${truckId}`, { method: 'DELETE' });
      onBack();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-white/40">Loading truck details...</div>
    );
  }

  if (!truck) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-accent text-sm hover:underline">&larr; Back to trucks</button>
        <div className="text-center py-20 text-white/40">Truck not found.</div>
      </div>
    );
  }

  const ymm = [truck.year, truck.make, truck.model].filter(Boolean).join(' ');
  const milesChanged = String(truck.currentMiles ?? 0) !== editMiles;
  const hoursChanged = String(truck.currentHours ?? 0) !== editHours;
  const odometerDirty = milesChanged || hoursChanged;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-accent text-sm hover:underline flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to trucks
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditTruck(true)}
            className="text-xs px-3 py-1.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 transition-colors"
          >
            Edit Truck
          </button>
          <button
            onClick={handleDeleteTruck}
            className="text-xs px-3 py-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Truck header card */}
      <div className="bg-slate-card border border-white/10 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-white">{truck.name}</h2>
          {ymm && <p className="text-sm text-white/50 mt-0.5">{ymm}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/40">
          {truck.vin && (
            <span>VIN: <span className="text-white/60 font-mono">{truck.vin}</span></span>
          )}
          {truck.licensePlate && (
            <span>Plate: <span className="text-white/60 font-mono">{truck.licensePlate}</span></span>
          )}
        </div>

        {/* Editable odometer */}
        <div className="flex items-end gap-4 pt-2 border-t border-white/[0.06]">
          <label className="space-y-1">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Current Miles</span>
            <input
              type="number"
              value={editMiles}
              onChange={(e) => setEditMiles(e.target.value)}
              className="w-32 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-bold tabular-nums focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Current Hours</span>
            <input
              type="number"
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
              className="w-32 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-bold tabular-nums focus:border-accent/50 focus:outline-none"
            />
          </label>
          {odometerDirty && (
            <button
              onClick={handleSaveOdometer}
              disabled={savingOdometer}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {savingOdometer ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Maintenance status grid */}
      <div className="space-y-3">
        <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Maintenance Status</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THRESHOLD_KEYS.map((tk) => {
            const threshold = truck.thresholds?.[tk.id];
            if (!threshold) return null;
            return (
              <MaintenanceCard
                key={tk.id}
                thresholdKey={tk.id}
                threshold={threshold}
                logs={logs}
                currentMiles={truck.currentMiles}
              />
            );
          })}
        </div>
      </div>

      {/* Maintenance log */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Maintenance Log</p>
          {!showAddLog && (
            <button
              onClick={() => setShowAddLog(true)}
              className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/80 transition-colors"
            >
              + Add Entry
            </button>
          )}
        </div>

        {showAddLog && (
          <AddLogForm
            truckId={truckId}
            onSaved={() => { setShowAddLog(false); loadTruck(); }}
            onCancel={() => setShowAddLog(false)}
          />
        )}

        <div className="bg-slate-card border border-white/10 rounded-2xl overflow-hidden">
          <LogTable logs={logs} />
        </div>
      </div>

      {/* Edit truck modal */}
      {showEditTruck && (
        <TruckForm
          truck={truck}
          onSaved={() => { setShowEditTruck(false); loadTruck(); }}
          onCancel={() => setShowEditTruck(false)}
        />
      )}
    </div>
  );
}

// ─── Main: TrucksTab ─────────────────────────────────────────────────────────

export default function TrucksTab() {
  const [trucks, setTrucks] = useState([]);
  const [truckLogs, setTruckLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const [showAddTruck, setShowAddTruck] = useState(false);

  const loadTrucks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJSON(API_BASE);
      setTrucks(data);

      // Fetch logs for each truck to compute status badges on cards
      const logEntries = {};
      await Promise.all(
        data.map(async (t) => {
          try {
            const logData = await fetchJSON(`${API_BASE}/${t.id}/log`);
            logEntries[t.id] = logData;
          } catch {
            logEntries[t.id] = [];
          }
        })
      );
      setTruckLogs(logEntries);
    } catch (err) {
      console.error('Failed to load trucks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTrucks(); }, [loadTrucks]);

  // Show truck profile
  if (selectedTruckId) {
    return (
      <TruckProfile
        truckId={selectedTruckId}
        onBack={() => { setSelectedTruckId(null); loadTrucks(); }}
      />
    );
  }

  // Truck list view
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Fleet</p>
          <p className="text-white/30 text-xs mt-0.5">
            {trucks.length} truck{trucks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowAddTruck(true)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 transition-colors"
        >
          + Add Truck
        </button>
      </div>

      {loading && trucks.length === 0 && (
        <div className="text-center py-16 text-white/40 text-sm">Loading trucks...</div>
      )}

      {!loading && trucks.length === 0 && (
        <div className="bg-slate-card border border-white/10 rounded-2xl p-12 text-center space-y-3">
          <div className="text-4xl text-white/10">&#x1F69A;</div>
          <p className="text-white/40 text-sm">No trucks added yet.</p>
          <button
            onClick={() => setShowAddTruck(true)}
            className="text-accent text-sm font-medium hover:underline"
          >
            Add your first truck
          </button>
        </div>
      )}

      {trucks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trucks.map((truck) => (
            <TruckCard
              key={truck.id}
              truck={truck}
              logs={truckLogs[truck.id] || []}
              onClick={() => setSelectedTruckId(truck.id)}
            />
          ))}
        </div>
      )}

      {showAddTruck && (
        <TruckForm
          truck={null}
          onSaved={() => { setShowAddTruck(false); loadTrucks(); }}
          onCancel={() => setShowAddTruck(false)}
        />
      )}
    </div>
  );
}
