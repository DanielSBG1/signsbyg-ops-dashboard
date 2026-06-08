// Period helpers — everything in local date (YYYY-MM-DD)
// because Asana Install Date is a date field without time/timezone.

function pad(n) { return String(n).padStart(2, '0'); }

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getPeriodRange(period) {
  const now = new Date();

  if (period === 'week') {
    // Sunday → Saturday
    const day = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toISODate(start), end: toISODate(end), label: 'This Week' };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toISODate(start), end: toISODate(end), label: 'This Month' };
  }

  // live = no filter
  return { start: null, end: null, label: 'Live' };
}

export function inRange(dateISO, range) {
  if (!range.start || !range.end) return true;
  if (!dateISO) return false;
  return dateISO >= range.start && dateISO <= range.end;
}

export function todayISO() {
  return toISODate(new Date());
}
