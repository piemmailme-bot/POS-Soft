const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current (or given) date in YYYY-MM-DD format strictly in Indian Standard Time (Asia/Kolkata).
 * Prevents UTC rollover mismatches between 00:00 and 05:30 IST.
 */
export function getIstDateStr(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback to browser local date
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns HH:mm in 24-hour Indian Standard Time (Asia/Kolkata).
 */
export function getIstTimeStr(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === 'hour')?.value;
    const min = parts.find((p) => p.type === 'minute')?.value;
    if (h && min) return `${h === '24' ? '00' : h}:${min}`;
  } catch {
    // Fallback to browser local time
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Returns YYYY-MM-DD HH:mm in Indian Standard Time (Asia/Kolkata).
 */
export function getIstDateTimeStr(date: Date = new Date()): string {
  return `${getIstDateStr(date)} ${getIstTimeStr(date)}`;
}

/**
 * Returns YYYY-MM-DD shifted by offsetDays relative to IST today.
 */
export function getIstDateOffsetStr(offsetDays: number, baseDate: Date = new Date()): string {
  const shifted = new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return getIstDateStr(shifted);
}

/**
 * Returns { start, end } YYYY-MM-DD bounds for a calendar month offset relative to IST today
 * (e.g. offsetMonths = 0 for current month, -1 for previous month).
 */
export function getIstMonthRange(
  offsetMonths = 0,
  baseDate: Date = new Date()
): { start: string; end: string } {
  const istToday = getIstDateStr(baseDate);
  const [yStr, mStr] = istToday.split('-');
  const baseYear = Number(yStr);
  const baseMonthIndex = Number(mStr) - 1; // 0-indexed
  const firstDayUtc = new Date(Date.UTC(baseYear, baseMonthIndex + offsetMonths, 1));
  const lastDayUtc = new Date(Date.UTC(baseYear, baseMonthIndex + offsetMonths + 1, 0));
  return {
    start: firstDayUtc.toISOString().slice(0, 10),
    end: lastDayUtc.toISOString().slice(0, 10),
  };
}

