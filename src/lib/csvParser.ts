import { parseFlexibleTime } from './timeUtils';

export interface ParsedCsvStop {
  eventDate: string;
  eventTime: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  details: string;
}

export interface CsvParseResult {
  rows: ParsedCsvStop[];
  warnings: string[];
  error?: string;
}

function parseCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  return rows;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const usMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (usMatch) {
    const m = usMatch[1].padStart(2, '0');
    const d = usMatch[2].padStart(2, '0');
    const y = usMatch[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseCoordinate(raw: string | undefined, min: number, max: number): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

export function parseItineraryCsv(csvText: string): CsvParseResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      rows: [],
      warnings: [],
      error: 'CSV must contain a header row and at least one itinerary row.',
    };
  }

  const headers = matrix[0].map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));

  const findIndex = (candidates: string[]) =>
    headers.findIndex((h) => candidates.includes(h));

  const dateIdx = findIndex(['date', 'eventdate', 'event_date', 'day', 'startdate']);
  const locationIdx = findIndex(['location', 'place', 'stop', 'destination', 'title', 'name']);
  const latIdx = findIndex(['latitude', 'lat']);
  const lngIdx = findIndex(['longitude', 'lng', 'lon', 'long']);
  const detailsIdx = findIndex(['details', 'notes', 'description', 'memo', 'itinerary']);
  const timeIdx = findIndex(['time', 'eventtime', 'event_time', 'starttime']);

  if (dateIdx === -1 || locationIdx === -1) {
    return {
      rows: [],
      warnings: [],
      error: 'CSV header must include both "date" and "location" columns.',
    };
  }

  const rows: ParsedCsvStop[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const rawDate = cols[dateIdx] || '';
    const rawLocation = cols[locationIdx] || '';
    const normalizedDate = normalizeDate(rawDate);

    if (!normalizedDate) {
      warnings.push(`Row ${i + 1}: Skipped due to unrecognized date "${rawDate}".`);
      continue;
    }
    if (!rawLocation.trim()) {
      warnings.push(`Row ${i + 1}: Skipped because location is empty.`);
      continue;
    }

    const lat = latIdx !== -1 ? parseCoordinate(cols[latIdx], -90, 90) : null;
    const lng = lngIdx !== -1 ? parseCoordinate(cols[lngIdx], -180, 180) : null;

    if (
      (latIdx !== -1 && cols[latIdx] && lat === null) ||
      (lngIdx !== -1 && cols[lngIdx] && lng === null)
    ) {
      warnings.push(`Row ${i + 1} (${rawLocation}): Ignored invalid coordinates.`);
    }

    const rawTime = timeIdx !== -1 ? (cols[timeIdx] || '').trim() : '';
    const parsedTime = rawTime ? parseFlexibleTime(rawTime, '24h') : '';

    rows.push({
      eventDate: normalizedDate,
      eventTime: parsedTime !== null ? parsedTime : rawTime,
      location: rawLocation.trim(),
      latitude: lat,
      longitude: lng,
      details: detailsIdx !== -1 ? (cols[detailsIdx] || '').trim() : '',
    });
  }

  return { rows, warnings };
}

export const SAMPLE_ITINERARY_CSV = `date,time,location,latitude,longitude,details
2026-11-16,09:00,Tokyo Station & Marunouchi,35.6812,139.7671,Pick up JR Rail Pass and store luggage before walking the Imperial Palace outer gardens.
2026-11-17,10:30,Kyoto Nishiki Market,35.0050,135.7649,Arrive on morning Shinkansen. Lunch tasting tour along Nishiki-dori.
2026-11-18,07:15,Arashiyama Bamboo Grove,35.0168,135.6713,Early morning walk before crowds; afternoon boat ride along Katsura River.
2026-11-19,14:00,Naoshima Art House Project,34.4605,133.9956,Ferry from Uno Port; visit Chichu Art Museum and Benesse House.
`;
