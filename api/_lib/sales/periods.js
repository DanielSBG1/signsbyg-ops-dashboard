// All period calculations are done in America/Chicago (Houston) regardless of
// where the server is running. Vercel functions run in UTC, so using native
// Date methods like getHours() would give wrong day boundaries for users here.
const BUSINESS_TZ = 'America/Chicago';

// Returns a Date object representing "now" in the business timezone as if it
// were local time. We use this so getFullYear/getMonth/getDate return the
// wall-clock values a user in Houston sees.
function nowInBusinessTz() {
  // Intl trick: format the current UTC instant in the business TZ, parse it back
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month) - 1, // 0-indexed
    day: parseInt(parts.day),
    hour: parseInt(parts.hour),
    minute: parseInt(parts.minute),
    second: parseInt(parts.second),
  };
}

// Build a UTC ISO string that represents midnight on the given business-TZ date.
// Handles DST correctly by probing the offset.
function businessMidnightUTC(year, month, day) {
  // Construct a UTC date for the candidate midnight, then find out what
  // America/Chicago says that UTC moment is. Adjust until they match.
  // Two iterations handle DST jumps.
  let guess = new Date(Date.UTC(year, month, day, 5, 0, 0)); // CDT midnight ≈ 5 UTC
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(guess);
    const h = parseInt(parts.find((p) => p.type === 'hour').value);
    const m = parseInt(parts.find((p) => p.type === 'minute').value);
    const y = parseInt(parts.find((p) => p.type === 'year').value);
    const mo = parseInt(parts.find((p) => p.type === 'month').value) - 1;
    const d = parseInt(parts.find((p) => p.type === 'day').value);
    // If it's already midnight of the right day, we're done
    if (y === year && mo === month && d === day && h === 0 && m === 0) return guess;
    // Adjust guess by the delta
    const dayDiff = (y - year) * 365 + (mo - month) * 30 + (d - day);
    const offsetFromMidnightMin = h * 60 + m;
    guess = new Date(guess.getTime() - dayDiff * 86400000 - offsetFromMidnightMin * 60000);
  }
  return guess;
}

export function getDateRange(period, customStart, customEnd) {
  const biz = nowInBusinessTz();
  const now = new Date(); // current instant for `end`

  switch (period) {
    case 'today': {
      const start = businessMidnightUTC(biz.year, biz.month, biz.day);
      const prevStart = businessMidnightUTC(biz.year, biz.month, biz.day - 1);
      return {
        start: start.toISOString(),
        end: now.toISOString(),
        prevStart: prevStart.toISOString(),
        prevEnd: start.toISOString(),
        label: 'Today',
      };
    }
    case 'week': {
      // Week starts Sunday in Houston TZ
      const today = businessMidnightUTC(biz.year, biz.month, biz.day);
      // Figure out the day of week in business TZ
      const dowParts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TZ,
        weekday: 'short',
      }).formatToParts(today);
      const wd = dowParts.find((p) => p.type === 'weekday').value;
      const dayOfWeek = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
      const weekStart = businessMidnightUTC(biz.year, biz.month, biz.day - dayOfWeek);
      const prevWeekStart = businessMidnightUTC(biz.year, biz.month, biz.day - dayOfWeek - 7);
      return {
        start: weekStart.toISOString(),
        end: now.toISOString(),
        prevStart: prevWeekStart.toISOString(),
        prevEnd: weekStart.toISOString(),
        label: 'This Week',
      };
    }
    case 'lastweek': {
      const dowParts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TZ,
        weekday: 'short',
      }).formatToParts(businessMidnightUTC(biz.year, biz.month, biz.day));
      const wd = dowParts.find((p) => p.type === 'weekday').value;
      const dayOfWeek = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
      const lastWeekStart = businessMidnightUTC(biz.year, biz.month, biz.day - dayOfWeek - 7);
      const lastWeekEnd = businessMidnightUTC(biz.year, biz.month, biz.day - dayOfWeek);
      const prevWeekStart = businessMidnightUTC(biz.year, biz.month, biz.day - dayOfWeek - 14);
      return {
        start: lastWeekStart.toISOString(),
        end: lastWeekEnd.toISOString(),
        prevStart: prevWeekStart.toISOString(),
        prevEnd: lastWeekStart.toISOString(),
        label: 'Last Week',
      };
    }
    case 'month': {
      const monthStart = businessMidnightUTC(biz.year, biz.month, 1);
      const prevMonthStart = businessMidnightUTC(biz.year, biz.month - 1, 1);
      return {
        start: monthStart.toISOString(),
        end: now.toISOString(),
        prevStart: prevMonthStart.toISOString(),
        prevEnd: monthStart.toISOString(),
        label: 'This Month',
      };
    }
    case 'quarter': {
      // Legacy "current quarter" — kept for backwards compat
      const qMonth = Math.floor(biz.month / 3) * 3;
      const qStart = businessMidnightUTC(biz.year, qMonth, 1);
      const prevQStart = businessMidnightUTC(biz.year, qMonth - 3, 1);
      return {
        start: qStart.toISOString(),
        end: now.toISOString(),
        prevStart: prevQStart.toISOString(),
        prevEnd: qStart.toISOString(),
        label: 'This Quarter',
      };
    }
    case 'q1':
    case 'q2':
    case 'q3':
    case 'q4': {
      const qIndex = parseInt(period.slice(1)) - 1; // 0..3
      const qStartMonth = qIndex * 3;
      const qStart = businessMidnightUTC(biz.year, qStartMonth, 1);
      const qEnd = businessMidnightUTC(biz.year, qStartMonth + 3, 1);
      // If the selected quarter is in the future, clamp end to now
      const endCandidate = qEnd.getTime() > now.getTime() ? now : qEnd;
      // Previous comparable period = same quarter in prior year
      const prevQStart = businessMidnightUTC(biz.year - 1, qStartMonth, 1);
      const prevQEnd = businessMidnightUTC(biz.year - 1, qStartMonth + 3, 1);
      return {
        start: qStart.toISOString(),
        end: endCandidate.toISOString(),
        prevStart: prevQStart.toISOString(),
        prevEnd: prevQEnd.toISOString(),
        label: `Q${qIndex + 1} ${biz.year}`,
      };
    }
    case 'year': {
      const yStart = businessMidnightUTC(biz.year, 0, 1);
      const prevYStart = businessMidnightUTC(biz.year - 1, 0, 1);
      return {
        start: yStart.toISOString(),
        end: now.toISOString(),
        prevStart: prevYStart.toISOString(),
        prevEnd: yStart.toISOString(),
        label: 'This Year',
      };
    }
    case 'custom': {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      const duration = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - duration);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: prevStart.toISOString(),
        prevEnd: start.toISOString(),
        label: `${customStart} – ${customEnd}`,
      };
    }
    default:
      return getDateRange('today');
  }
}
