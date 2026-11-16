export type TripAccessRole = 'owner' | 'edit' | 'view';

export interface TripRecord {
  clientId: string;
  title: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description: string;
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
  accessRole?: TripAccessRole;
  ownerName?: string;
  ownerEmail?: string;
  syncStatus?: 'synced' | 'pending';
}

export interface TripShareRecord {
  id: number;
  userId: number;
  email: string;
  name: string;
  permission: 'view' | 'edit';
  createdAt: string;
}

export interface ShareableUser {
  id: number;
  uid: string;
  email: string;
  name: string;
}

export interface EventRecord {
  clientId: string;
  tripClientId: string;
  eventDate: string; // YYYY-MM-DD
  eventTime: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  details: string;
  journalEntry: string;
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
  syncStatus?: 'synced' | 'pending';
}

export interface PhotoRecord {
  clientId: string;
  eventClientId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  diskPath?: string;
  thumbDiskPath?: string;
  caption: string;
  createdAt: string;
  deletedAt: string | null;
  blob?: Blob;
  thumbBlob?: Blob;
  hasLocalFile?: boolean;
  syncStatus?: 'synced' | 'pending';
}

export type BookingStatus = 'confirmed' | 'unconfirmed';

export interface BookingRecord {
  clientId: string;
  tripClientId: string;
  name: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  status: BookingStatus;
  confirmationCode: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
  syncStatus?: 'synced' | 'pending';
}

export interface PdfRecord {
  clientId: string;
  eventClientId: string;
  bookingClientId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  diskPath?: string;
  extractedText: string;
  createdAt: string;
  deletedAt: string | null;
  blob?: Blob;
  hasLocalFile?: boolean;
  syncStatus?: 'synced' | 'pending';
}

export type PackingCategory =
  | 'Clothing'
  | 'Documents'
  | 'Electronics'
  | 'Toiletries'
  | 'Health & Safety'
  | 'Gear & Comfort'
  | 'Other';

export interface PackingItemRecord {
  clientId: string;
  tripClientId: string;
  name: string;
  category: PackingCategory;
  quantity: number;
  packed: boolean;
  isAutoSuggested: boolean;
  reason: string;
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
  syncStatus?: 'synced' | 'pending';
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  label: string;
  tempMaxC: number;
  tempMinC: number;
  precipProbMax: number | null;
  precipMm: number | null;
  windMaxKmh: number | null;
}

export interface WeatherForecastResponse {
  destinationQuery: string;
  resolvedName: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  mode: 'trip-dates' | 'historical' | 'current-outlook';
  note: string;
  fetchedAt: string;
  days: WeatherDay[];
}

export type SyncOpType =
  | 'trip_upsert'
  | 'trip_delete'
  | 'event_upsert'
  | 'event_delete'
  | 'booking_upsert'
  | 'booking_delete'
  | 'packing_upsert'
  | 'packing_delete'
  | 'photo_upload'
  | 'photo_delete'
  | 'pdf_upload'
  | 'pdf_delete';

export interface SyncQueueItem {
  id?: number;
  type: SyncOpType;
  clientId: string;
  createdAt: string;
}

export interface LocalUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: LocalUser;
}

export type AppView = 'agenda' | 'calendar' | 'map' | 'packing' | 'search' | 'admin';

export interface SearchMatch {
  event?: EventRecord;
  booking?: BookingRecord;
  trip: TripRecord | undefined;
  source: 'location' | 'details' | 'journal' | 'booking' | 'pdf';
  pdfFilename?: string;
  pdfClientId?: string;
  snippet: string;
}

export interface CalendarThemeSettings {
  eventDayBg: string;
  tripDayBg: string;
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarThemeSettings = {
  eventDayBg: '#fef3c7',
  tripDayBg: '#dff5f2',
};
