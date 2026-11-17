import { htmlToPlainText } from './htmlSanitizer';
import type {
  BookingRecord,
  EventRecord,
  PackingCategory,
  PackingItemRecord,
  TripRecord,
  WeatherForecastResponse,
} from '../types/journal';

export interface SmartSuggestionCandidate {
  name: string;
  category: PackingCategory;
  quantity: number;
  reason: string;
}

function computeTripDays(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 3;
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(60, diff));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function generateSmartPackingSuggestions(opts: {
  trip: TripRecord;
  events: EventRecord[];
  bookings: BookingRecord[];
  existingItems: PackingItemRecord[];
  weather?: WeatherForecastResponse | null;
  pdfCount: number;
}): SmartSuggestionCandidate[] {
  const { trip, events, bookings, existingItems, weather, pdfCount } = opts;
  const days = computeTripDays(trip.startDate, trip.endDate);
  const washCycleDays = Math.min(days, 7);
  const nights = Math.max(1, days - 1);

  const candidates: SmartSuggestionCandidate[] = [];
  const existingSet = new Set(existingItems.map((i) => normalizeName(i.name)));
  const addedSet = new Set<string>();

  const push = (
    name: string,
    category: PackingCategory,
    quantity: number,
    reason: string
  ) => {
    const key = normalizeName(name);
    if (!key || existingSet.has(key) || addedSet.has(key)) return;
    addedSet.add(key);
    candidates.push({ name, category, quantity, reason });
  };

  // 1. Duration-aware core clothing
  push('Underwear', 'Clothing', washCycleDays + 1, `${days}-day itinerary (+1 spare)`);
  push('Socks', 'Clothing', washCycleDays + 1, `${days}-day itinerary (+1 spare)`);
  push(
    'Shirts / Tops',
    'Clothing',
    Math.min(days, 7),
    days > 7 ? `${days} days · 1 week rotation` : `${days}-day trip`
  );
  push(
    'Trousers / Shorts / Skirts',
    'Clothing',
    Math.max(2, Math.min(4, Math.ceil(days / 2))),
    `${days}-day trip`
  );
  push('Sleepwear', 'Clothing', nights >= 4 ? 2 : 1, `${nights} ${nights === 1 ? 'night' : 'nights'}`);
  push('Comfortable walking shoes', 'Clothing', 1, `${events.length || 1} itinerary stops`);
  if (days >= 5) {
    push('Laundry bag & travel detergent sheets', 'Gear & Comfort', 1, `${days}-day trip (re-wear prep)`);
  }

  // 2. Core documents & essentials
  push('Photo ID / Passport', 'Documents', 1, 'Essential travel document');
  push('Payment cards & emergency cash', 'Documents', 2, 'Daily expenses & backup');
  push('Travel insurance details', 'Documents', 1, 'Emergency coverage reference');

  if (bookings.length > 0) {
    const unconfirmedCount = bookings.filter((b) => b.status === 'unconfirmed').length;
    push(
      'Accommodation confirmation printouts',
      'Documents',
      bookings.length,
      unconfirmedCount > 0
        ? `${bookings.length} stays (${unconfirmedCount} unconfirmed backup)`
        : `${bookings.length} booked ${bookings.length === 1 ? 'stay' : 'stays'}`
    );
  }
  if (pdfCount > 0) {
    push(
      'Verify offline PDF downloads on phone',
      'Documents',
      1,
      `${pdfCount} attached ${pdfCount === 1 ? 'PDF' : 'PDFs'} in trip`
    );
  }

  // 3. Weather-aware suggestions (from Open-Meteo trip forecast)
  if (weather && weather.days.length > 0) {
    const maxTemp = Math.max(...weather.days.map((d) => d.tempMaxC));
    const minTemp = Math.min(...weather.days.map((d) => d.tempMinC));
    const hasRain = weather.days.some(
      (d) =>
        (d.precipProbMax !== null && d.precipProbMax >= 35) ||
        (d.precipMm !== null && d.precipMm >= 1.5) ||
        (d.weatherCode >= 51 && d.weatherCode <= 67) ||
        (d.weatherCode >= 80 && d.weatherCode <= 99)
    );
    const hasSnow = weather.days.some(
      (d) => (d.weatherCode >= 71 && d.weatherCode <= 77) || d.weatherCode === 85 || d.weatherCode === 86
    );
    const hasWind = weather.days.some((d) => (d.windMaxKmh ?? 0) >= 30);

    if (hasRain) {
      push('Packable rain jacket', 'Clothing', 1, `Rain expected in ${weather.resolvedName}`);
      push('Compact umbrella', 'Gear & Comfort', 1, `Rain expected in ${weather.resolvedName}`);
    }
    if (minTemp <= 10 || hasSnow) {
      push('Warm jacket / fleece layer', 'Clothing', 1, `Lows down to ${minTemp}°C`);
      push('Scarf & lightweight gloves', 'Clothing', 1, `Chilly evenings (${minTemp}°C)`);
    }
    if (hasSnow) {
      push('Waterproof boots / traction footwear', 'Clothing', 1, 'Snow in destination forecast');
    }
    if (maxTemp >= 25) {
      push('Sunscreen SPF 30+', 'Health & Safety', 1, `Highs up to ${maxTemp}°C`);
      push('Sunglasses & sun hat', 'Gear & Comfort', 1, `Warm/sunny highs (${maxTemp}°C)`);
    }
    if (maxTemp - minTemp >= 11 && minTemp > 10) {
      push('Light cardigan or packable sweater', 'Clothing', 1, `${minTemp}°C–${maxTemp}°C temperature swing`);
    }
    if (hasWind) {
      push('Windproof outer shell', 'Clothing', 1, 'Breezy winds in forecast');
    }
  } else {
    push('Light packable outer layer', 'Clothing', 1, 'Versatile weather backup');
  }

  // 4. Electronics & Toiletries
  push('Phone + fast charging cable', 'Electronics', 1, 'Navigation, maps & offline photos');
  push('Portable power bank', 'Electronics', 1, 'All-day GPS & offline camera use');
  push('Travel power adapter', 'Electronics', 1, trip.destination ? `For ${trip.destination}` : 'Universal outlet compatibility');
  push('Toothbrush, toothpaste & deodorant', 'Toiletries', 1, 'Daily essentials');
  push('Personal medications & small first-aid kit', 'Health & Safety', 1, 'Bandages, pain reliever, prescriptions');
  push('Refillable water bottle', 'Gear & Comfort', 1, 'Daily hydration on the go');
  push('Daypack / crossbody bag', 'Gear & Comfort', 1, 'Carry water, layers & documents');

  // 5. Contextual keyword analysis across trip, stops & stays
  const corpus = [
    trip.destination,
    trip.title,
    trip.description,
    ...events.map((e) => `${e.location} ${htmlToPlainText(e.details)} ${htmlToPlainText(e.journalEntry)}`),
    ...bookings.map((b) => `${b.name} ${b.address} ${htmlToPlainText(b.notes)}`),
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(flight|airport|airline|boarding|terminal|fly)\b/.test(corpus)) {
    push('Neck pillow & earplugs / eye mask', 'Gear & Comfort', 1, 'Flight detected in itinerary');
    push('TSA-sized liquid pouch', 'Toiletries', 1, 'Airport carry-on screening');
  }
  if (/\b(train|rail|shinkansen|eurail|station|ferry)\b/.test(corpus)) {
    push('Rail pass / transit card holder', 'Documents', 1, 'Train or ferry transit planned');
  }
  if (/\b(hike|trail|mountain|canyon|trek|national park|summit|waterfall)\b/.test(corpus)) {
    push('Hiking socks & blister plasters', 'Health & Safety', 2, 'Trail/hiking stops in itinerary');
    push('Trail snacks & electrolytes', 'Gear & Comfort', 1, 'Outdoor hiking energy');
  }
  if (/\b(beach|swim|pool|snorkel|coast|island|spa|onsen)\b/.test(corpus)) {
    push('Swimwear', 'Clothing', 1, 'Beach, pool, or hot spring noted');
    push('Quick-dry travel towel', 'Gear & Comfort', 1, 'Water/swim activities');
  }
  if (/\b(camera|photo|sunset|sunrise|viewpoint|observatory)\b/.test(corpus)) {
    push('Camera, spare battery & SD card', 'Electronics', 1, 'Photography stops planned');
  }
  if (/\b(dinner|restaurant|theater|concert|opera|dress|michelin)\b/.test(corpus)) {
    push('Smart casual dinner outfit', 'Clothing', 1, 'Evening dining or venue booked');
  }

  return candidates;
}
