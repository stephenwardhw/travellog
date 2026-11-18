export type TimeFormatMode = '12h' | '24h';

const TIME_FORMAT_STORAGE_KEY = 'travellog_time_format';

export function getStoredTimeFormat(): TimeFormatMode {
  try {
    const val = window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY);
    if (val === '12h' || val === '24h') return val;
    // Detect sensible default from browser locale if unset
    const sample = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(
      new Date(2026, 0, 1, 14, 0)
    );
    return /am|pm|a\.m\.|p\.m\./i.test(sample) ? '12h' : '24h';
  } catch {
    return '12h';
  }
}

export function setStoredTimeFormat(mode: TimeFormatMode): void {
  try {
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parses either 24-hour ("14:30", "1430", "09:05", "9:05", "19") or
 * 12-hour AM/PM ("2:30 PM", "2:30p", "230pm", "12:00 AM", "9 am") strings
 * into canonical 24-hour "HH:MM". Returns "" for empty input, or null if invalid.
 */
export function parseFlexibleTime(
  raw: string,
  preferredMode: TimeFormatMode = '24h',
  defaultPeriod: 'AM' | 'PM' = 'AM'
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const normalized = trimmed
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');

  // Extract optional AM/PM suffix
  const meridiemMatch = normalized.match(/^(.+?)\s*(am?|pm?)$/i);
  const explicitPeriod: 'AM' | 'PM' | null = meridiemMatch
    ? meridiemMatch[2].startsWith('p')
      ? 'PM'
      : 'AM'
    : null;
  const body = (meridiemMatch ? meridiemMatch[1] : normalized).trim();

  let hours: number | null = null;
  let minutes = 0;

  if (/^\d{1,2}:\d{2}$/.test(body)) {
    const [hStr, mStr] = body.split(':');
    hours = Number(hStr);
    minutes = Number(mStr);
  } else if (/^\d{3,4}$/.test(body)) {
    // Support compact input like "930" -> 09:30 or "1430" -> 14:30
    const padded = body.padStart(4, '0');
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2, 4));
  } else if (/^\d{1,2}$/.test(body)) {
    hours = Number(body);
    minutes = 0;
  }

  if (
    hours === null ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  if (explicitPeriod) {
    // 12-hour time explicit AM / PM
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (explicitPeriod === 'AM') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  // No explicit AM/PM
  if (hours < 0 || hours > 23) {
    return null;
  }

  // If 13-23 or 00, it is unambiguously 24-hour time even if UI toggle is 12h
  if (hours === 0 || hours >= 13) {
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  // Hours 1-12 with no AM/PM: respect 24h vs 12h preference
  if (preferredMode === '24h') {
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  // In 12h mode without suffix, use current defaultPeriod for 1..12
  const converted =
    defaultPeriod === 'AM'
      ? hours === 12
        ? 0
        : hours
      : hours === 12
      ? 12
      : hours + 12;
  return `${pad2(converted)}:${pad2(minutes)}`;
}

export function splitCanonicalTime(hhmm: string): {
  hour24: number;
  minute: number;
  hour12: number;
  period: 'AM' | 'PM';
} | null {
  const match = hhmm.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour24, minute, hour12, period };
}

export function toCanonicalTime(hour24: number, minute: number): string {
  const h = Math.max(0, Math.min(23, Math.trunc(hour24)));
  const m = Math.max(0, Math.min(59, Math.trunc(minute)));
  return `${pad2(h)}:${pad2(m)}`;
}

export function to24HourFrom12Hour(
  hour12: number,
  minute: number,
  period: 'AM' | 'PM'
): string {
  const clampedH = Math.max(1, Math.min(12, Math.trunc(hour12)));
  const h24 =
    period === 'AM'
      ? clampedH === 12
        ? 0
        : clampedH
      : clampedH === 12
      ? 12
      : clampedH + 12;
  return toCanonicalTime(h24, minute);
}

export function format12Hour(hhmm: string): string {
  const parts = splitCanonicalTime(hhmm);
  if (!parts) return hhmm;
  return `${parts.hour12}:${pad2(parts.minute)} ${parts.period}`;
}

export function format24Hour(hhmm: string): string {
  const parts = splitCanonicalTime(hhmm);
  if (!parts) return hhmm;
  return `${pad2(parts.hour24)}:${pad2(parts.minute)}`;
}

export function formatTimeForMode(hhmm: string, mode: TimeFormatMode): string {
  if (!hhmm.trim()) return '';
  return mode === '12h' ? format12Hour(hhmm) : format24Hour(hhmm);
}
