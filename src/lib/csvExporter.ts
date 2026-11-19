export interface CsvTripLike {
  title: string;
}

export interface CsvEventLike {
  eventDate: string;
  eventTime?: string | null;
  location: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  details?: string | null;
  journalEntry?: string | null;
}

export interface CsvBookingLike {
  name: string;
  checkInDate: string;
  checkOutDate: string;
  status?: string | null;
  confirmationCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

export function slugifyTripTitle(title: string): string {
  return (
    (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip'
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    });
}

export function htmlToCleanCsvText(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const withLinks = value.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
      if (!cleanLabel || cleanLabel === href) return href;
      return `${cleanLabel} (${href})`;
    }
  );
  const withLineBreaks = withLinks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '* ')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(withLineBreaks)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface CsvRowRecord {
  sortDate: string;
  sortOrder: number;
  sortTime: string;
  cells: string[];
}

export function buildItineraryCsv(input: {
  trip?: CsvTripLike | null;
  events: CsvEventLike[];
  bookings?: CsvBookingLike[];
}): string {
  const headers = [
    'date',
    'time',
    'type',
    'location',
    'address',
    'latitude',
    'longitude',
    'end_date',
    'status',
    'confirmation_code',
    'details',
    'journal_entry',
  ];

  const rows: CsvRowRecord[] = [];

  for (const bk of input.bookings || []) {
    rows.push({
      sortDate: bk.checkInDate || '',
      sortOrder: 0,
      sortTime: '',
      cells: [
        bk.checkInDate || '',
        '',
        'Stay',
        bk.name || '',
        bk.address || '',
        bk.latitude !== null && bk.latitude !== undefined ? String(bk.latitude) : '',
        bk.longitude !== null && bk.longitude !== undefined ? String(bk.longitude) : '',
        bk.checkOutDate || '',
        bk.status || '',
        bk.confirmationCode || '',
        htmlToCleanCsvText(bk.notes),
        '',
      ],
    });
  }

  for (const ev of input.events) {
    rows.push({
      sortDate: ev.eventDate || '',
      sortOrder: 1,
      sortTime: ev.eventTime || '',
      cells: [
        ev.eventDate || '',
        ev.eventTime || '',
        'Stop',
        ev.location || '',
        ev.address || '',
        ev.latitude !== null && ev.latitude !== undefined ? String(ev.latitude) : '',
        ev.longitude !== null && ev.longitude !== undefined ? String(ev.longitude) : '',
        '',
        '',
        '',
        htmlToCleanCsvText(ev.details),
        htmlToCleanCsvText(ev.journalEntry),
      ],
    });
  }

  rows.sort((a, b) => {
    const dateCmp = a.sortDate.localeCompare(b.sortDate);
    if (dateCmp !== 0) return dateCmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.sortTime.localeCompare(b.sortTime);
  });

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.cells.map(escapeCsvCell).join(',')),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  downloadBlobFile(filename, new Blob([content], { type: mimeType }));
}
