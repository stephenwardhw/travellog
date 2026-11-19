const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseIsoDateUtc(iso: string): number | null {
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

/**
 * Signed whole-day difference (toIso - fromIso) using UTC calendar dates
 * so daylight-saving transitions never cause off-by-one shifts.
 */
export function diffIsoDays(fromIso: string, toIso: string): number | null {
  const fromUtc = parseIsoDateUtc(fromIso);
  const toUtc = parseIsoDateUtc(toIso);
  if (fromUtc === null || toUtc === null) return null;
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

/**
 * Shifts an ISO "YYYY-MM-DD" date string by `deltaDays` calendar days.
 * Returns the original value untouched if `iso` is not a valid calendar date.
 */
export function shiftIsoDate(iso: string, deltaDays: number): string {
  if (!deltaDays) return iso;
  const utc = parseIsoDateUtc(iso);
  if (utc === null) return iso;
  const shifted = new Date(utc + deltaDays * MS_PER_DAY);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDayShiftLabel(deltaDays: number): string {
  if (deltaDays === 0) return '0 days';
  const sign = deltaDays > 0 ? '+' : '';
  return `${sign}${deltaDays} ${Math.abs(deltaDays) === 1 ? 'day' : 'days'}`;
}
