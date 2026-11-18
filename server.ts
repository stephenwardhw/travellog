import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  appSettings,
  bookings,
  events,
  expenses,
  packingItems,
  pdfs,
  photos,
  trips,
  tripShares,
  users,
} from './src/db/schema.ts';
import { type AuthRequest, requireAdmin, requireAuth } from './src/middleware/auth.ts';
import { hashPassword, signSessionToken, verifyPassword } from './src/lib/localAuth.ts';
import {
  countLocalAdmins,
  createLocalUser,
  deleteLocalUser,
  findUserByEmail,
  findUserById,
  hasConfiguredAdmin,
  listUsers,
  updateLocalUser,
} from './src/db/users.ts';
import {
  getAccessibleTripsForUser,
  getBookingAccessByClientId,
  getEventAccessByClientId,
  getExpenseAccessByClientId,
  getPackingItemAccessByClientId,
  getTripAccessByClientId,
  getTripAccessForTripRow,
  listShareableUsers,
  listTripShares,
} from './src/db/tripAccess.ts';

const PORT = Number(process.env.PORT) || 3000;
const MAX_PHOTO_SIZE_MB = Math.max(1, Number(process.env.MAX_PHOTO_SIZE_MB) || 100);
const MAX_PDF_SIZE_MB = Math.max(1, Number(process.env.MAX_PDF_SIZE_MB) || 100);
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const PHOTOS_DIR = path.join(UPLOADS_ROOT, 'photos');
const PDFS_DIR = path.join(UPLOADS_ROOT, 'pdfs');

fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(PDFS_DIR, { recursive: true });

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '');
}

const DEFAULT_CALENDAR_SETTINGS = {
  eventDayBg: '#fef3c7',
  tripDayBg: '#dff5f2',
};

const CALENDAR_EVENT_COLOR_KEY = 'calendar_event_day_color';
const CALENDAR_TRIP_COLOR_KEY = 'calendar_trip_day_color';

function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

async function getCalendarSettings() {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [CALENDAR_EVENT_COLOR_KEY, CALENDAR_TRIP_COLOR_KEY]));

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    eventDayBg:
      normalizeHexColor(map.get(CALENDAR_EVENT_COLOR_KEY)) || DEFAULT_CALENDAR_SETTINGS.eventDayBg,
    tripDayBg:
      normalizeHexColor(map.get(CALENDAR_TRIP_COLOR_KEY)) || DEFAULT_CALENDAR_SETTINGS.tripDayBg,
  };
}

function resolveSafeUploadPath(relativeDiskPath: string): string | null {
  const resolved = path.resolve(process.cwd(), relativeDiskPath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function wmoCodeToLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Severe thunderstorm';
  return 'Mixed weather';
}

interface GeoCandidate {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

async function geocodeDestination(rawDestination: string): Promise<GeoCandidate | null> {
  const cleaned = rawDestination.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const candidates = [cleaned];
  if (cleaned.includes(',')) {
    candidates.push(cleaned.split(',')[0].trim());
  }

  for (const query of candidates) {
    if (!query) continue;
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query
    )}&count=1&language=en&format=json`;
    const geoRes = await fetch(url);
    if (!geoRes.ok) continue;
    const geoJson = (await geoRes.json()) as { results?: GeoCandidate[] };
    if (Array.isArray(geoJson.results) && geoJson.results.length > 0) {
      return geoJson.results[0];
    }
  }
  return null;
}

interface GeocodeSearchResult {
  displayName: string;
  latitude: number;
  longitude: number;
  category?: string;
}

async function geocodeAddressOrPlace(rawQuery: string): Promise<GeocodeSearchResult[]> {
  const cleaned = rawQuery.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const results: GeocodeSearchResult[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: GeocodeSearchResult) => {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;
    const lat = Number(item.latitude.toFixed(6));
    const lng = Number(item.longitude.toFixed(6));
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      displayName: item.displayName,
      latitude: lat,
      longitude: lng,
      category: item.category,
    });
  };

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(
      cleaned
    )}`;
    const nomRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'TravelLog/1.0 (https://travellog.local)',
        'Accept-Language': 'en',
      },
    });
    if (nomRes.ok) {
      const rows = (await nomRes.json()) as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
        type?: string;
        class?: string;
      }>;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const lat = Number(row.lat);
          const lng = Number(row.lon);
          if (row.display_name && Number.isFinite(lat) && Number.isFinite(lng)) {
            pushUnique({
              displayName: row.display_name,
              latitude: lat,
              longitude: lng,
              category: row.type || row.class,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Nominatim geocode lookup failed, falling back:', err);
  }

  if (results.length === 0) {
    const fallbackCandidates = [cleaned];
    if (cleaned.includes(',')) {
      fallbackCandidates.push(cleaned.split(',')[0].trim());
    }
    for (const q of fallbackCandidates) {
      if (!q) continue;
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          q
        )}&count=5&language=en&format=json`;
        const geoRes = await fetch(url);
        if (!geoRes.ok) continue;
        const geoJson = (await geoRes.json()) as { results?: GeoCandidate[] };
        if (Array.isArray(geoJson.results)) {
          for (const candidate of geoJson.results) {
            const parts = [candidate.name, candidate.admin1, candidate.country].filter(Boolean);
            pushUnique({
              displayName: parts.join(', '),
              latitude: candidate.latitude,
              longitude: candidate.longitude,
              category: 'place',
            });
          }
        }
        if (results.length > 0) break;
      } catch {
        // Ignore fallback failure
      }
    }
  }

  return results.slice(0, 5);
}

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const authReq = req as AuthRequest;
      const uid = sanitizeSegment(authReq.user?.uid || 'anonymous');
      const dir =
        file.fieldname === 'thumb'
          ? path.join(PHOTOS_DIR, uid, 'thumbs')
          : path.join(PHOTOS_DIR, uid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const clientId = sanitizeSegment(String(req.body?.clientId || Date.now()));
      if (file.fieldname === 'thumb') {
        cb(null, `${clientId}.jpg`);
        return;
      }
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const safeExt = /\.(jpg|jpeg|png|webp|gif|heic|avif)$/i.test(ext) ? ext : '.jpg';
      cb(null, `${clientId}${safeExt}`);
    },
  }),
  limits: { fileSize: MAX_PHOTO_SIZE_MB * 1024 * 1024 },
});

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const authReq = req as AuthRequest;
      const uid = sanitizeSegment(authReq.user?.uid || 'anonymous');
      const dir = path.join(PDFS_DIR, uid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => {
      const clientId = sanitizeSegment(String(req.body?.clientId || Date.now()));
      cb(null, `${clientId}.pdf`);
    },
  }),
  limits: { fileSize: MAX_PDF_SIZE_MB * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/tiles/:s/:z/:x/:file', async (req, res) => {
    const { s, z, x, file } = req.params;
    if (
      !/^[a-d]$/.test(s) ||
      !/^\d{1,2}$/.test(z) ||
      !/^\d+$/.test(x) ||
      !/^\d+(@2x)?\.png$/.test(file)
    ) {
      return res.status(400).send('Invalid tile parameters');
    }

    const apiKey = (process.env.CARTO_API_KEY || process.env.VITE_CARTO_API_KEY || '').trim();
    const upstreamUrl = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${file}${
      apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''
    }`;

    try {
      const upstream = await fetch(upstreamUrl);
      if (!upstream.ok) {
        return res.status(upstream.status).send('Tile unavailable');
      }
      const contentType = upstream.headers.get('content-type') || 'image/png';
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Cache-Control',
        apiKey ? 'public, max-age=2592000' : 'no-cache'
      );
      res.send(Buffer.from(arrayBuf));
    } catch (error) {
      console.error('CARTO tile proxy failed:', error);
      res.status(502).send('Failed to fetch map tile');
    }
  });

  app.get('/api/auth/status', async (_req, res) => {
    try {
      const hasAdmin = await hasConfiguredAdmin();
      res.json({ needsSetup: !hasAdmin });
    } catch (error) {
      console.error('Auth status check failed:', error);
      res.status(500).json({ error: 'Unable to verify authentication status.' });
    }
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const hasAdmin = await hasConfiguredAdmin();
      if (hasAdmin) {
        return res.status(403).json({
          error: 'An administrator account already exists. Please sign in.',
        });
      }

      const { name, email, password } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '');
      const cleanName = String(name || '').trim() || 'Administrator';

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (cleanPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const existing = await findUserByEmail(cleanEmail);
      let user;
      if (existing) {
        user = await updateLocalUser(existing.id, {
          name: cleanName,
          role: 'admin',
          passwordHash: hashPassword(cleanPassword),
        });
      } else {
        user = await createLocalUser({
          email: cleanEmail,
          name: cleanName,
          passwordHash: hashPassword(cleanPassword),
          role: 'admin',
        });
      }

      if (!user) {
        return res.status(500).json({ error: 'Failed to create administrator.' });
      }

      const token = signSessionToken(user);
      res.status(201).json({ token, user });
    } catch (error) {
      console.error('Bootstrap admin failed:', error);
      res.status(500).json({ error: 'Failed to create administrator account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '');

      if (!cleanEmail || !cleanPassword) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const found = await findUserByEmail(cleanEmail);
      if (!found || !found.passwordHash || !verifyPassword(cleanPassword, found.passwordHash)) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const safeUser = {
        id: found.id,
        uid: found.uid,
        email: found.email,
        name: found.name,
        role: found.role,
        createdAt: found.createdAt,
      };
      const token = signSessionToken(safeUser);
      res.json({ token, user: safeUser });
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Sign-in failed. Please try again.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.user });
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const allUsers = await listUsers();
      res.json({ users: allUsers });
    } catch (error) {
      console.error('Admin list users failed:', error);
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, email, password, role } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(name || '').trim();
      const cleanPassword = String(password || '');
      const cleanRole: 'admin' | 'user' = role === 'admin' ? 'admin' : 'user';

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Valid email address is required.' });
      }
      if (cleanPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const existing = await findUserByEmail(cleanEmail);
      if (existing) {
        return res.status(409).json({ error: 'A user with this email already exists.' });
      }

      const created = await createLocalUser({
        email: cleanEmail,
        name: cleanName || cleanEmail.split('@')[0],
        passwordHash: hashPassword(cleanPassword),
        role: cleanRole,
      });

      res.status(201).json({ user: created });
    } catch (error) {
      console.error('Admin create user failed:', error);
      res.status(500).json({ error: 'Failed to create user.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid user id.' });
      }

      const target = await findUserById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const { name, role, password } = req.body || {};
      const updates: { name?: string; role?: 'admin' | 'user'; passwordHash?: string } = {};

      if (typeof name === 'string') updates.name = name;
      if (role === 'admin' || role === 'user') {
        if (target.role === 'admin' && role === 'user') {
          const adminCount = await countLocalAdmins();
          if (adminCount <= 1) {
            return res
              .status(400)
              .json({ error: 'Cannot demote the last remaining administrator.' });
          }
        }
        updates.role = role;
      }
      if (typeof password === 'string' && password.length > 0) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        updates.passwordHash = hashPassword(password);
      }

      const updated = await updateLocalUser(targetId, updates);
      res.json({ user: updated });
    } catch (error) {
      console.error('Admin update user failed:', error);
      res.status(500).json({ error: 'Failed to update user.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid user id.' });
      }
      if (req.dbUserId === targetId) {
        return res.status(400).json({ error: 'You cannot delete your own active account.' });
      }

      const target = await findUserById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      if (target.role === 'admin') {
        const adminCount = await countLocalAdmins();
        if (adminCount <= 1) {
          return res
            .status(400)
            .json({ error: 'Cannot delete the last remaining administrator.' });
        }
      }

      const deleted = await deleteLocalUser(targetId);
      if (!deleted) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const safeUid = sanitizeSegment(deleted.uid);
      if (safeUid) {
        const userPhotoDir = path.join(PHOTOS_DIR, safeUid);
        const userPdfDir = path.join(PDFS_DIR, safeUid);
        if (fs.existsSync(userPhotoDir)) fs.rmSync(userPhotoDir, { recursive: true, force: true });
        if (fs.existsSync(userPdfDir)) fs.rmSync(userPdfDir, { recursive: true, force: true });
      }

      res.json({ deleted: true, id: targetId });
    } catch (error) {
      console.error('Admin delete user failed:', error);
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  });

  app.get('/api/admin/trips', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const tripRows = await db
        .select({
          id: trips.id,
          clientId: trips.clientId,
          title: trips.title,
          destination: trips.destination,
          startDate: trips.startDate,
          endDate: trips.endDate,
          archivedAt: trips.archivedAt,
          createdAt: trips.createdAt,
          updatedAt: trips.updatedAt,
          ownerId: trips.userId,
          ownerName: users.name,
          ownerEmail: users.email,
        })
        .from(trips)
        .innerJoin(users, eq(trips.userId, users.id))
        .where(isNull(trips.deletedAt))
        .orderBy(desc(trips.updatedAt));

      const tripIds = tripRows.map((t) => t.id);
      const [eventRows, bookingRows, expenseRows] =
        tripIds.length > 0
          ? await Promise.all([
              db
                .select({ tripId: events.tripId })
                .from(events)
                .where(and(inArray(events.tripId, tripIds), isNull(events.deletedAt))),
              db
                .select({ tripId: bookings.tripId })
                .from(bookings)
                .where(and(inArray(bookings.tripId, tripIds), isNull(bookings.deletedAt))),
              db
                .select({ tripId: expenses.tripId })
                .from(expenses)
                .where(and(inArray(expenses.tripId, tripIds), isNull(expenses.deletedAt))),
            ])
          : [[], [], []];

      const eventCounts = new Map<number, number>();
      for (const r of eventRows) eventCounts.set(r.tripId, (eventCounts.get(r.tripId) || 0) + 1);
      const bookingCounts = new Map<number, number>();
      for (const r of bookingRows)
        bookingCounts.set(r.tripId, (bookingCounts.get(r.tripId) || 0) + 1);
      const expenseCounts = new Map<number, number>();
      for (const r of expenseRows)
        expenseCounts.set(r.tripId, (expenseCounts.get(r.tripId) || 0) + 1);

      const enriched = tripRows.map((t) => ({
        ...t,
        eventCount: eventCounts.get(t.id) || 0,
        bookingCount: bookingCounts.get(t.id) || 0,
        expenseCount: expenseCounts.get(t.id) || 0,
      }));

      res.json({ trips: enriched });
    } catch (error) {
      console.error('Admin list trips failed:', error);
      res.status(500).json({ error: 'Failed to load trips.' });
    }
  });

  app.patch(
    '/api/admin/trips/:clientId/archive',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const clientId = String(req.params.clientId);
        const archived = Boolean(req.body?.archived);
        const now = new Date();

        const [existing] = await db
          .select()
          .from(trips)
          .where(eq(trips.clientId, clientId))
          .limit(1);

        if (!existing || existing.deletedAt) {
          return res.status(404).json({ error: 'Trip not found.' });
        }

        const [updated] = await db
          .update(trips)
          .set({
            archivedAt: archived ? now : null,
            updatedAt: now,
          })
          .where(eq(trips.id, existing.id))
          .returning();

        res.json({ trip: updated });
      } catch (error) {
        console.error('Admin archive trip failed:', error);
        res.status(500).json({ error: 'Failed to update trip archive status.' });
      }
    }
  );

  app.delete(
    '/api/admin/trips/:clientId',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const clientId = String(req.params.clientId);
        const [trip] = await db
          .select()
          .from(trips)
          .where(eq(trips.clientId, clientId))
          .limit(1);

        if (!trip) {
          return res.status(404).json({ error: 'Trip not found.' });
        }

        const [tripEvents, tripBookings] = await Promise.all([
          db.select({ id: events.id }).from(events).where(eq(events.tripId, trip.id)),
          db.select({ id: bookings.id }).from(bookings).where(eq(bookings.tripId, trip.id)),
        ]);

        const eventIds = tripEvents.map((e) => e.id);
        const bookingIds = tripBookings.map((b) => b.id);

        const photoFilters = [];
        if (eventIds.length > 0) photoFilters.push(inArray(photos.eventId, eventIds));
        if (bookingIds.length > 0) photoFilters.push(inArray(photos.bookingId, bookingIds));

        const tripPhotos =
          photoFilters.length === 2
            ? await db.select().from(photos).where(or(photoFilters[0], photoFilters[1]))
            : photoFilters.length === 1
            ? await db.select().from(photos).where(photoFilters[0])
            : [];

        const pdfFilters = [];
        if (eventIds.length > 0) pdfFilters.push(inArray(pdfs.eventId, eventIds));
        if (bookingIds.length > 0) pdfFilters.push(inArray(pdfs.bookingId, bookingIds));

        const tripPdfs =
          pdfFilters.length === 2
            ? await db.select().from(pdfs).where(or(pdfFilters[0], pdfFilters[1]))
            : pdfFilters.length === 1
            ? await db.select().from(pdfs).where(pdfFilters[0])
            : [];

        for (const ph of tripPhotos) {
          const fullPath = ph.diskPath ? resolveSafeUploadPath(ph.diskPath) : null;
          if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          const thumbPath = ph.thumbDiskPath ? resolveSafeUploadPath(ph.thumbDiskPath) : null;
          if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }

        for (const pd of tripPdfs) {
          const fullPath = pd.diskPath ? resolveSafeUploadPath(pd.diskPath) : null;
          if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

        await db.delete(trips).where(eq(trips.id, trip.id));

        res.json({ deleted: true, clientId });
      } catch (error) {
        console.error('Admin delete trip failed:', error);
        res.status(500).json({ error: 'Failed to permanently delete trip.' });
      }
    }
  );

  app.get('/api/settings/calendar', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const settings = await getCalendarSettings();
      res.json({ settings });
    } catch (error) {
      console.error('Load calendar settings failed:', error);
      res.status(500).json({ error: 'Failed to load calendar settings.' });
    }
  });

  app.put(
    '/api/admin/settings/calendar',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const eventDayBg = normalizeHexColor(req.body?.eventDayBg);
        const tripDayBg = normalizeHexColor(req.body?.tripDayBg);

        if (!eventDayBg || !tripDayBg) {
          return res
            .status(400)
            .json({ error: 'Both colors must be valid 6-digit hex codes (e.g. #fef3c7).' });
        }

        const now = new Date();
        await db
          .insert(appSettings)
          .values([
            { key: CALENDAR_EVENT_COLOR_KEY, value: eventDayBg, updatedAt: now },
            { key: CALENDAR_TRIP_COLOR_KEY, value: tripDayBg, updatedAt: now },
          ])
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value: sql`excluded.value`,
              updatedAt: now,
            },
          });

        res.json({ settings: { eventDayBg, tripDayBg } });
      } catch (error) {
        console.error('Save calendar settings failed:', error);
        res.status(500).json({ error: 'Failed to save calendar settings.' });
      }
    }
  );

  app.get('/api/users/shareable', requireAuth, async (req: AuthRequest, res) => {
    try {
      const shareable = await listShareableUsers(req.dbUserId!);
      res.json({ users: shareable });
    } catch (error) {
      console.error('List shareable users failed:', error);
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });

  app.get('/api/trips/:clientId/shares', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getTripAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Trip not found.' });
      }
      if (access.role !== 'owner') {
        return res.status(403).json({ error: 'Only the trip owner can manage sharing.' });
      }

      const shares = await listTripShares(access.trip.id);
      res.json({ shares });
    } catch (error) {
      console.error('Load trip shares failed:', error);
      res.status(500).json({ error: 'Failed to load trip sharing settings.' });
    }
  });

  app.post('/api/trips/:clientId/shares', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getTripAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Trip not found.' });
      }
      if (access.role !== 'owner') {
        return res.status(403).json({ error: 'Only the trip owner can share this trip.' });
      }

      const { targetUserId, email, permission } = req.body || {};
      const cleanPerm: 'view' | 'edit' = permission === 'edit' ? 'edit' : 'view';

      let targetUser = null;
      if (targetUserId !== undefined && targetUserId !== null) {
        const parsedId = Number(targetUserId);
        if (Number.isInteger(parsedId) && parsedId > 0) {
          targetUser = await findUserById(parsedId);
        }
      } else if (typeof email === 'string' && email.trim()) {
        const found = await findUserByEmail(email);
        if (found) {
          targetUser = {
            id: found.id,
            uid: found.uid,
            email: found.email,
            name: found.name,
            role: found.role,
            createdAt: found.createdAt,
          };
        }
      }

      if (!targetUser) {
        return res.status(404).json({ error: 'User account not found.' });
      }
      if (targetUser.id === userId) {
        return res.status(400).json({ error: 'You already own this trip.' });
      }

      const existingShare = await db
        .select()
        .from(tripShares)
        .where(and(eq(tripShares.tripId, access.trip.id), eq(tripShares.userId, targetUser.id)))
        .limit(1);

      if (existingShare.length > 0) {
        await db
          .update(tripShares)
          .set({ permission: cleanPerm })
          .where(eq(tripShares.id, existingShare[0].id));
      } else {
        await db.insert(tripShares).values({
          tripId: access.trip.id,
          userId: targetUser.id,
          permission: cleanPerm,
        });
      }

      const shares = await listTripShares(access.trip.id);
      res.json({ shares });
    } catch (error) {
      console.error('Save trip share failed:', error);
      res.status(500).json({ error: 'Failed to update trip sharing.' });
    }
  });

  app.delete(
    '/api/trips/:clientId/shares/:targetUserId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const userId = req.dbUserId!;
        const clientId = String(req.params.clientId);
        const targetUserId = Number(req.params.targetUserId);

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
          return res.status(400).json({ error: 'Invalid user id.' });
        }

        const access = await getTripAccessByClientId(clientId, userId);
        if (!access) {
          return res.status(404).json({ error: 'Trip not found.' });
        }
        if (access.role !== 'owner') {
          return res.status(403).json({ error: 'Only the trip owner can manage sharing.' });
        }

        await db
          .delete(tripShares)
          .where(and(eq(tripShares.tripId, access.trip.id), eq(tripShares.userId, targetUserId)));

        const shares = await listTripShares(access.trip.id);
        res.json({ shares });
      } catch (error) {
        console.error('Remove trip share failed:', error);
        res.status(500).json({ error: 'Failed to remove user access.' });
      }
    }
  );

  app.get('/api/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const accessibleTrips = await getAccessibleTripsForUser(userId);
      const tripIds = accessibleTrips.map((t) => t.id);

      const [syncedEvents, syncedBookings, syncedPackingItems, syncedExpenses] =
        tripIds.length > 0
          ? await Promise.all([
              db.select().from(events).where(inArray(events.tripId, tripIds)),
              db.select().from(bookings).where(inArray(bookings.tripId, tripIds)),
              db.select().from(packingItems).where(inArray(packingItems.tripId, tripIds)),
              db.select().from(expenses).where(inArray(expenses.tripId, tripIds)),
            ])
          : [[], [], [], []];

      const eventIds = syncedEvents.map((e) => e.id);
      const bookingIds = syncedBookings.map((b) => b.id);

      const photoFilters = [];
      if (eventIds.length > 0) photoFilters.push(inArray(photos.eventId, eventIds));
      if (bookingIds.length > 0) photoFilters.push(inArray(photos.bookingId, bookingIds));

      const syncedPhotos =
        photoFilters.length === 2
          ? await db.select().from(photos).where(or(photoFilters[0], photoFilters[1]))
          : photoFilters.length === 1
          ? await db.select().from(photos).where(photoFilters[0])
          : [];

      const pdfFilters = [];
      if (eventIds.length > 0) pdfFilters.push(inArray(pdfs.eventId, eventIds));
      if (bookingIds.length > 0) pdfFilters.push(inArray(pdfs.bookingId, bookingIds));

      const syncedPdfs =
        pdfFilters.length === 2
          ? await db.select().from(pdfs).where(or(pdfFilters[0], pdfFilters[1]))
          : pdfFilters.length === 1
          ? await db.select().from(pdfs).where(pdfFilters[0])
          : [];

      const calendarSettings = await getCalendarSettings();

      res.json({
        trips: accessibleTrips,
        events: syncedEvents,
        bookings: syncedBookings,
        packingItems: syncedPackingItems,
        expenses: syncedExpenses,
        photos: syncedPhotos,
        pdfs: syncedPdfs,
        calendarSettings,
        serverTime: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error('Sync pull failed:', error);
      res.status(500).json({ error: 'Failed to synchronize journal data.' });
    }
  });

  app.post('/api/trips/upsert', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const {
        clientId,
        title,
        destination,
        startDate,
        endDate,
        description,
        startLocationName,
        startLatitude,
        startLongitude,
        endLocationName,
        endLatitude,
        endLongitude,
        targetBudget,
        budgetCurrency,
        archivedAt,
        updatedAt,
        deletedAt,
      } = req.body || {};

      if (!clientId || !title || !startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required trip fields.' });
      }

      const existingRows = await db
        .select()
        .from(trips)
        .where(eq(trips.clientId, String(clientId)))
        .limit(1);

      let accessRole: 'owner' | 'edit' = 'owner';
      if (existingRows.length > 0) {
        const existing = existingRows[0];
        const role = await getTripAccessForTripRow(existing, userId);
        if (!role || role === 'view') {
          return res.status(403).json({ error: 'You do not have permission to modify this trip.' });
        }
        if (role !== 'owner' && deletedAt) {
          return res.status(403).json({ error: 'Only the trip owner can delete this trip.' });
        }
        if (
          role !== 'owner' &&
          archivedAt !== undefined &&
          Boolean(archivedAt) !== Boolean(existing.archivedAt)
        ) {
          return res.status(403).json({ error: 'Only the trip owner can archive or unarchive this trip.' });
        }
        accessRole = role;
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;
      const archivedTimestamp = archivedAt ? new Date(archivedAt) : null;

      const parseCoord = (v: unknown) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const parseBudget = (v: unknown) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const cleanCurrency =
        String(budgetCurrency || 'USD')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, '')
          .slice(0, 6) || 'USD';

      const sLat = parseCoord(startLatitude);
      const sLng = parseCoord(startLongitude);
      const eLat = parseCoord(endLatitude);
      const eLng = parseCoord(endLongitude);
      const cleanBudget = parseBudget(targetBudget);

      const [saved] = await db
        .insert(trips)
        .values({
          clientId: String(clientId),
          userId,
          title: String(title),
          destination: String(destination || ''),
          startDate: String(startDate),
          endDate: String(endDate),
          description: String(description || ''),
          startLocationName: String(startLocationName || ''),
          startLatitude: sLat,
          startLongitude: sLng,
          endLocationName: String(endLocationName || ''),
          endLatitude: eLat,
          endLongitude: eLng,
          targetBudget: cleanBudget,
          budgetCurrency: cleanCurrency,
          archivedAt: archivedTimestamp,
          updatedAt: now,
          deletedAt: deletedTimestamp,
        })
        .onConflictDoUpdate({
          target: trips.clientId,
          set: {
            title: String(title),
            destination: String(destination || ''),
            startDate: String(startDate),
            endDate: String(endDate),
            description: String(description || ''),
            startLocationName: String(startLocationName || ''),
            startLatitude: sLat,
            startLongitude: sLng,
            endLocationName: String(endLocationName || ''),
            endLatitude: eLat,
            endLongitude: eLng,
            targetBudget: cleanBudget,
            budgetCurrency: cleanCurrency,
            archivedAt: archivedTimestamp,
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json({ ...saved, accessRole });
    } catch (error: unknown) {
      console.error('Trip upsert failed:', error);
      res.status(500).json({ error: 'Failed to save trip.' });
    }
  });

  app.delete('/api/trips/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const now = new Date();

      const existing = await db
        .select()
        .from(trips)
        .where(eq(trips.clientId, clientId))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Trip not found.' });
      }
      if (existing[0].userId !== userId) {
        return res.status(403).json({ error: 'Only the trip owner can delete this trip.' });
      }

      const [updated] = await db
        .update(trips)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(trips.clientId, clientId), eq(trips.userId, userId)))
        .returning();

      await db
        .update(events)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(events.tripId, updated.id));

      await db
        .update(bookings)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(bookings.tripId, updated.id));

      await db
        .update(packingItems)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(packingItems.tripId, updated.id));

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Trip delete failed:', error);
      res.status(500).json({ error: 'Failed to delete trip.' });
    }
  });

  app.post('/api/events/upsert', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const {
        clientId,
        tripClientId,
        eventDate,
        eventTime,
        location,
        address,
        latitude,
        longitude,
        details,
        journalEntry,
        updatedAt,
        deletedAt,
      } = req.body || {};

      if (!clientId || !tripClientId || !eventDate || !location) {
        return res.status(400).json({ error: 'Missing required event fields.' });
      }

      const tripAccess = await getTripAccessByClientId(String(tripClientId), userId);
      if (!tripAccess) {
        return res.status(404).json({ error: 'Parent trip not found on server yet.' });
      }
      if (tripAccess.role === 'view') {
        return res.status(403).json({ error: 'View-only access: cannot modify stops in this trip.' });
      }

      const existing = await db
        .select()
        .from(events)
        .where(eq(events.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].tripId !== tripAccess.trip.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;
      const latNum =
        latitude !== null && latitude !== undefined && latitude !== '' ? Number(latitude) : null;
      const lngNum =
        longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null;

      const [saved] = await db
        .insert(events)
        .values({
          clientId: String(clientId),
          tripClientId: String(tripClientId),
          tripId: tripAccess.trip.id,
          userId,
          eventDate: String(eventDate),
          eventTime: String(eventTime || ''),
          location: String(location),
          address: String(address || ''),
          latitude: Number.isFinite(latNum) ? latNum : null,
          longitude: Number.isFinite(lngNum) ? lngNum : null,
          details: String(details || ''),
          journalEntry: String(journalEntry || ''),
          updatedAt: now,
          deletedAt: deletedTimestamp,
        })
        .onConflictDoUpdate({
          target: events.clientId,
          set: {
            tripClientId: String(tripClientId),
            tripId: tripAccess.trip.id,
            eventDate: String(eventDate),
            eventTime: String(eventTime || ''),
            location: String(location),
            address: String(address || ''),
            latitude: Number.isFinite(latNum) ? latNum : null,
            longitude: Number.isFinite(lngNum) ? lngNum : null,
            details: String(details || ''),
            journalEntry: String(journalEntry || ''),
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json(saved);
    } catch (error: unknown) {
      console.error('Event upsert failed:', error);
      res.status(500).json({ error: 'Failed to save event.' });
    }
  });

  app.delete('/api/events/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getEventAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Event not found.' });
      }
      if (access.role === 'view') {
        return res.status(403).json({ error: 'View-only access: cannot delete stops in this trip.' });
      }

      const now = new Date();
      await db
        .update(events)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(events.id, access.event.id));

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Event delete failed:', error);
      res.status(500).json({ error: 'Failed to delete event.' });
    }
  });

  app.post('/api/bookings/upsert', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const {
        clientId,
        tripClientId,
        name,
        checkInDate,
        checkOutDate,
        status,
        confirmationCode,
        address,
        latitude,
        longitude,
        notes,
        updatedAt,
        deletedAt,
      } = req.body || {};

      if (!clientId || !tripClientId || !name || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: 'Missing required booking fields.' });
      }

      const tripAccess = await getTripAccessByClientId(String(tripClientId), userId);
      if (!tripAccess) {
        return res.status(404).json({ error: 'Parent trip not found on server yet.' });
      }
      if (tripAccess.role === 'view') {
        return res.status(403).json({ error: 'View-only access: cannot modify bookings in this trip.' });
      }

      const existing = await db
        .select()
        .from(bookings)
        .where(eq(bookings.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].tripId !== tripAccess.trip.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;
      const latNum =
        latitude !== null && latitude !== undefined && latitude !== '' ? Number(latitude) : null;
      const lngNum =
        longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null;
      const cleanStatus = status === 'confirmed' ? 'confirmed' : 'unconfirmed';

      const [saved] = await db
        .insert(bookings)
        .values({
          clientId: String(clientId),
          tripClientId: String(tripClientId),
          tripId: tripAccess.trip.id,
          userId,
          name: String(name),
          checkInDate: String(checkInDate),
          checkOutDate: String(checkOutDate),
          status: cleanStatus,
          confirmationCode: String(confirmationCode || ''),
          address: String(address || ''),
          latitude: Number.isFinite(latNum) ? latNum : null,
          longitude: Number.isFinite(lngNum) ? lngNum : null,
          notes: String(notes || ''),
          updatedAt: now,
          deletedAt: deletedTimestamp,
        })
        .onConflictDoUpdate({
          target: bookings.clientId,
          set: {
            tripClientId: String(tripClientId),
            tripId: tripAccess.trip.id,
            name: String(name),
            checkInDate: String(checkInDate),
            checkOutDate: String(checkOutDate),
            status: cleanStatus,
            confirmationCode: String(confirmationCode || ''),
            address: String(address || ''),
            latitude: Number.isFinite(latNum) ? latNum : null,
            longitude: Number.isFinite(lngNum) ? lngNum : null,
            notes: String(notes || ''),
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json(saved);
    } catch (error: unknown) {
      console.error('Booking upsert failed:', error);
      res.status(500).json({ error: 'Failed to save booking.' });
    }
  });

  app.delete('/api/bookings/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getBookingAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Booking not found.' });
      }
      if (access.role === 'view') {
        return res.status(403).json({ error: 'View-only access: cannot delete bookings in this trip.' });
      }

      const now = new Date();
      await db
        .update(bookings)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(bookings.id, access.booking.id));

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Booking delete failed:', error);
      res.status(500).json({ error: 'Failed to delete booking.' });
    }
  });

  app.post('/api/packing/upsert', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const {
        clientId,
        tripClientId,
        name,
        category,
        quantity,
        packed,
        isAutoSuggested,
        reason,
        updatedAt,
        deletedAt,
      } = req.body || {};

      if (!clientId || !tripClientId || !name) {
        return res.status(400).json({ error: 'Missing required packing item fields.' });
      }

      const tripAccess = await getTripAccessByClientId(String(tripClientId), userId);
      if (!tripAccess) {
        return res.status(404).json({ error: 'Parent trip not found on server yet.' });
      }
      if (tripAccess.role === 'view') {
        return res.status(403).json({
          error: 'View-only access: cannot modify packing checklist in this trip.',
        });
      }

      const existing = await db
        .select()
        .from(packingItems)
        .where(eq(packingItems.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].tripId !== tripAccess.trip.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;
      const qtyNum = Math.max(1, Math.min(99, Number(quantity) || 1));

      const [saved] = await db
        .insert(packingItems)
        .values({
          clientId: String(clientId),
          tripClientId: String(tripClientId),
          tripId: tripAccess.trip.id,
          userId,
          name: String(name),
          category: String(category || 'Other'),
          quantity: qtyNum,
          packed: Boolean(packed),
          isAutoSuggested: Boolean(isAutoSuggested),
          reason: String(reason || ''),
          updatedAt: now,
          deletedAt: deletedTimestamp,
        })
        .onConflictDoUpdate({
          target: packingItems.clientId,
          set: {
            tripClientId: String(tripClientId),
            tripId: tripAccess.trip.id,
            name: String(name),
            category: String(category || 'Other'),
            quantity: qtyNum,
            packed: Boolean(packed),
            isAutoSuggested: Boolean(isAutoSuggested),
            reason: String(reason || ''),
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json(saved);
    } catch (error: unknown) {
      console.error('Packing item upsert failed:', error);
      res.status(500).json({ error: 'Failed to save packing item.' });
    }
  });

  app.delete('/api/packing/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getPackingItemAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Packing item not found.' });
      }
      if (access.role === 'view') {
        return res.status(403).json({
          error: 'View-only access: cannot delete packing items in this trip.',
        });
      }

      const now = new Date();
      await db
        .update(packingItems)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(packingItems.id, access.item.id));

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Packing item delete failed:', error);
      res.status(500).json({ error: 'Failed to delete packing item.' });
    }
  });

  app.post('/api/expenses/upsert', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const {
        clientId,
        tripClientId,
        title,
        amount,
        currency,
        expenseDate,
        category,
        paymentMethod,
        notes,
        updatedAt,
        deletedAt,
      } = req.body || {};

      const amountNum = Number(amount);
      if (!clientId || !tripClientId || !title || !expenseDate || !Number.isFinite(amountNum) || amountNum < 0) {
        return res.status(400).json({ error: 'Missing or invalid required expense fields.' });
      }

      const tripAccess = await getTripAccessByClientId(String(tripClientId), userId);
      if (!tripAccess) {
        return res.status(404).json({ error: 'Parent trip not found on server yet.' });
      }
      if (tripAccess.role === 'view') {
        return res.status(403).json({
          error: 'View-only access: cannot modify budget expenses in this trip.',
        });
      }

      const existing = await db
        .select()
        .from(expenses)
        .where(eq(expenses.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].tripId !== tripAccess.trip.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;
      const cleanCurrency =
        String(currency || 'USD')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, '')
          .slice(0, 6) || 'USD';

      const [saved] = await db
        .insert(expenses)
        .values({
          clientId: String(clientId),
          tripClientId: String(tripClientId),
          tripId: tripAccess.trip.id,
          userId,
          title: String(title),
          amount: Number(amountNum.toFixed(2)),
          currency: cleanCurrency,
          expenseDate: String(expenseDate),
          category: String(category || 'Other'),
          paymentMethod: String(paymentMethod || 'Credit Card'),
          notes: String(notes || ''),
          updatedAt: now,
          deletedAt: deletedTimestamp,
        })
        .onConflictDoUpdate({
          target: expenses.clientId,
          set: {
            tripClientId: String(tripClientId),
            tripId: tripAccess.trip.id,
            title: String(title),
            amount: Number(amountNum.toFixed(2)),
            currency: cleanCurrency,
            expenseDate: String(expenseDate),
            category: String(category || 'Other'),
            paymentMethod: String(paymentMethod || 'Credit Card'),
            notes: String(notes || ''),
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json(saved);
    } catch (error: unknown) {
      console.error('Expense upsert failed:', error);
      res.status(500).json({ error: 'Failed to save expense.' });
    }
  });

  app.delete('/api/expenses/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const access = await getExpenseAccessByClientId(clientId, userId);

      if (!access) {
        return res.status(404).json({ error: 'Expense not found.' });
      }
      if (access.role === 'view') {
        return res.status(403).json({
          error: 'View-only access: cannot delete expenses in this trip.',
        });
      }

      const now = new Date();
      await db
        .update(expenses)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(expenses.id, access.expense.id));

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Expense delete failed:', error);
      res.status(500).json({ error: 'Failed to delete expense.' });
    }
  });

  app.get('/api/geocode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const query = String(req.query.q || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'Enter an address or place name to search.' });
      }
      const results = await geocodeAddressOrPlace(query);
      res.json({ query, results });
    } catch (error: unknown) {
      console.error('Geocode lookup failed:', error);
      res.status(500).json({ error: 'Failed to look up coordinates for that location.' });
    }
  });

  app.get('/api/weather', requireAuth, async (req: AuthRequest, res) => {
    try {
      const destination = String(req.query.destination || '').trim();
      const startDate = String(req.query.startDate || '').trim();
      const endDate = String(req.query.endDate || startDate).trim();

      if (!destination) {
        return res.status(400).json({ error: 'Destination is required for weather lookup.' });
      }

      const geo = await geocodeDestination(destination);
      if (!geo) {
        return res.status(404).json({
          error: `Could not locate "${destination}" in the weather directory.`,
        });
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const forecastMin = addDaysIso(todayIso, -2);
      const forecastMax = addDaysIso(todayIso, 15);
      const archiveMax = addDaysIso(todayIso, -3);

      const cleanStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayIso;
      const cleanEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= cleanStart ? endDate : cleanStart;

      let mode: 'trip-dates' | 'historical' | 'current-outlook' = 'trip-dates';
      let note = '';
      let weatherUrl = '';

      if (cleanEnd < forecastMin) {
        // Past trip: fetch up to 5 days of recorded weather from Open-Meteo archive
        const winStart = cleanStart;
        const maxFive = addDaysIso(winStart, 4);
        const winEnd = [maxFive, cleanEnd, archiveMax].sort()[0];
        mode = 'historical';
        note = `Recorded destination weather for trip dates (${winStart} – ${winEnd}).`;
        weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&start_date=${winStart}&end_date=${winEnd}`;
      } else if (cleanStart > forecastMax) {
        // Beyond 16-day forecast horizon: fetch live upcoming 5-day forecast as current destination outlook
        mode = 'current-outlook';
        note = `Trip dates (${cleanStart} – ${cleanEnd}) are beyond the 16-day forecast window; showing current 5-day outlook for ${geo.name}.`;
        weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=5`;
      } else {
        // Overlaps forecast horizon: take up to 5 days for the trip starting within [forecastMin, forecastMax]
        const winStart = cleanStart >= forecastMin ? cleanStart : forecastMin;
        const maxEndByForecast = forecastMax;
        const idealEnd = addDaysIso(winStart, 4);
        const winEnd = idealEnd <= maxEndByForecast ? idealEnd : maxEndByForecast;
        mode = 'trip-dates';
        note = `5-day forecast aligned with trip dates starting ${winStart}.`;
        weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto&start_date=${winStart}&end_date=${winEnd}`;
      }

      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) {
        return res.status(502).json({ error: 'Public weather API returned an error.' });
      }

      const data = (await weatherRes.json()) as {
        timezone?: string;
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: Array<number | null>;
          precipitation_sum?: Array<number | null>;
          wind_speed_10m_max?: Array<number | null>;
        };
      };

      const times = data.daily?.time || [];
      const codes = data.daily?.weather_code || [];
      const maxTemps = data.daily?.temperature_2m_max || [];
      const minTemps = data.daily?.temperature_2m_min || [];
      const precipProbs = data.daily?.precipitation_probability_max || [];
      const precipSums = data.daily?.precipitation_sum || [];
      const windMaxes = data.daily?.wind_speed_10m_max || [];

      const days = times.slice(0, 5).map((dateStr, idx) => {
        const code = Number(codes[idx] ?? 0);
        return {
          date: dateStr,
          weatherCode: code,
          label: wmoCodeToLabel(code),
          tempMaxC: Math.round(Number(maxTemps[idx] ?? 0)),
          tempMinC: Math.round(Number(minTemps[idx] ?? 0)),
          precipProbMax:
            precipProbs[idx] !== undefined && precipProbs[idx] !== null
              ? Math.round(Number(precipProbs[idx]))
              : null,
          precipMm:
            precipSums[idx] !== undefined && precipSums[idx] !== null
              ? Number(Number(precipSums[idx]).toFixed(1))
              : null,
          windMaxKmh:
            windMaxes[idx] !== undefined && windMaxes[idx] !== null
              ? Math.round(Number(windMaxes[idx]))
              : null,
        };
      });

      res.json({
        destinationQuery: destination,
        resolvedName: geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name,
        country: geo.country || '',
        latitude: geo.latitude,
        longitude: geo.longitude,
        timezone: data.timezone || geo.timezone || 'UTC',
        mode,
        note,
        fetchedAt: new Date().toISOString(),
        days,
      });
    } catch (error: unknown) {
      console.error('Weather lookup failed:', error);
      res.status(500).json({ error: 'Unable to fetch destination weather forecast.' });
    }
  });

  app.post(
    '/api/photos',
    requireAuth,
    photoUpload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'thumb', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      try {
        const userId = req.dbUserId!;
        const uploaded = req.files as Record<string, Express.Multer.File[]> | undefined;
        const file = uploaded?.file?.[0];
        const thumb = uploaded?.thumb?.[0];
        const { clientId, eventClientId, bookingClientId, caption } = req.body || {};

        const cleanEventClientId =
          typeof eventClientId === 'string' ? eventClientId.trim() : '';
        const cleanBookingClientId =
          typeof bookingClientId === 'string' ? bookingClientId.trim() : '';

        if (!file || !clientId || (!cleanEventClientId && !cleanBookingClientId)) {
          if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (thumb?.path && fs.existsSync(thumb.path)) fs.unlinkSync(thumb.path);
          return res.status(400).json({ error: 'Missing photo file or metadata.' });
        }

        let eventId: number | null = null;
        let bookingId: number | null = null;
        let role: 'owner' | 'edit' | 'view' | null = null;

        if (cleanEventClientId) {
          const eventAccess = await getEventAccessByClientId(cleanEventClientId, userId);
          if (!eventAccess) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            if (thumb?.path && fs.existsSync(thumb.path)) fs.unlinkSync(thumb.path);
            return res.status(404).json({ error: 'Parent event not found on server yet.' });
          }
          eventId = eventAccess.event.id;
          role = eventAccess.role;
        } else if (cleanBookingClientId) {
          const bookingAccess = await getBookingAccessByClientId(cleanBookingClientId, userId);
          if (!bookingAccess) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            if (thumb?.path && fs.existsSync(thumb.path)) fs.unlinkSync(thumb.path);
            return res.status(404).json({ error: 'Parent booking not found on server yet.' });
          }
          bookingId = bookingAccess.booking.id;
          role = bookingAccess.role;
        }

        if (role === 'view' || !role) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (thumb?.path && fs.existsSync(thumb.path)) fs.unlinkSync(thumb.path);
          return res.status(403).json({ error: 'View-only access: cannot upload photos to this trip.' });
        }

        const relativeDiskPath = path.relative(process.cwd(), file.path);
        const relativeThumbPath = thumb ? path.relative(process.cwd(), thumb.path) : '';

        const [saved] = await db
          .insert(photos)
          .values({
            clientId: String(clientId),
            eventClientId: cleanEventClientId,
            eventId,
            bookingClientId: cleanBookingClientId,
            bookingId,
            userId,
            filename: file.originalname || path.basename(file.path),
            mimeType: file.mimetype || 'image/jpeg',
            sizeBytes: file.size,
            diskPath: relativeDiskPath,
            thumbDiskPath: relativeThumbPath,
            caption: String(caption || ''),
            deletedAt: null,
          })
          .onConflictDoUpdate({
            target: photos.clientId,
            set: {
              diskPath: relativeDiskPath,
              thumbDiskPath: relativeThumbPath,
              sizeBytes: file.size,
              mimeType: file.mimetype || 'image/jpeg',
              caption: String(caption || ''),
              deletedAt: null,
            },
          })
          .returning();

        res.json(saved);
      } catch (error: unknown) {
        console.error('Photo upload failed:', error);
        res.status(500).json({ error: 'Failed to store photo on disk.' });
      }
    }
  );

  app.get('/api/photos/:clientId/thumb', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [photo] = await db
        .select()
        .from(photos)
        .where(eq(photos.clientId, clientId))
        .limit(1);

      if (!photo || photo.deletedAt) {
        return res.status(404).json({ error: 'Photo not found.' });
      }

      const access = photo.eventClientId
        ? await getEventAccessByClientId(photo.eventClientId, userId)
        : photo.bookingClientId
        ? await getBookingAccessByClientId(photo.bookingClientId, userId)
        : null;
      if (!access) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const thumbPath = photo.thumbDiskPath ? resolveSafeUploadPath(photo.thumbDiskPath) : null;
      if (thumbPath && fs.existsSync(thumbPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=31536000');
        fs.createReadStream(thumbPath).pipe(res);
        return;
      }

      const fullPath = resolveSafeUploadPath(photo.diskPath);
      if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Photo file missing on disk.' });
      }

      res.setHeader('Content-Type', photo.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=31536000');
      fs.createReadStream(fullPath).pipe(res);
    } catch (error: unknown) {
      console.error('Photo thumbnail download failed:', error);
      res.status(500).json({ error: 'Failed to stream photo thumbnail.' });
    }
  });

  app.get('/api/photos/:clientId/file', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [photo] = await db
        .select()
        .from(photos)
        .where(eq(photos.clientId, clientId))
        .limit(1);

      if (!photo || photo.deletedAt) {
        return res.status(404).json({ error: 'Photo not found.' });
      }

      const access = photo.eventClientId
        ? await getEventAccessByClientId(photo.eventClientId, userId)
        : photo.bookingClientId
        ? await getBookingAccessByClientId(photo.bookingClientId, userId)
        : null;
      if (!access) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const fullPath = resolveSafeUploadPath(photo.diskPath);
      if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Photo file missing on disk.' });
      }

      res.setHeader('Content-Type', photo.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=31536000');
      fs.createReadStream(fullPath).pipe(res);
    } catch (error: unknown) {
      console.error('Photo download failed:', error);
      res.status(500).json({ error: 'Failed to stream photo.' });
    }
  });

  app.delete('/api/photos/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [photo] = await db
        .select()
        .from(photos)
        .where(eq(photos.clientId, clientId))
        .limit(1);

      if (!photo) {
        return res.status(404).json({ error: 'Photo not found.' });
      }

      const access = photo.eventClientId
        ? await getEventAccessByClientId(photo.eventClientId, userId)
        : photo.bookingClientId
        ? await getBookingAccessByClientId(photo.bookingClientId, userId)
        : null;
      if (!access || access.role === 'view') {
        return res.status(403).json({ error: 'You do not have permission to delete this photo.' });
      }

      await db
        .update(photos)
        .set({ deletedAt: new Date() })
        .where(eq(photos.id, photo.id));

      const fullPath = resolveSafeUploadPath(photo.diskPath);
      if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      if (photo.thumbDiskPath) {
        const thumbPath = resolveSafeUploadPath(photo.thumbDiskPath);
        if (thumbPath && fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      }

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Photo delete failed:', error);
      res.status(500).json({ error: 'Failed to delete photo.' });
    }
  });

  app.post('/api/pdfs', requireAuth, pdfUpload.single('file'), async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const file = req.file;
      const { clientId, eventClientId, bookingClientId, extractedText } = req.body || {};

      const cleanEventClientId = typeof eventClientId === 'string' ? eventClientId.trim() : '';
      const cleanBookingClientId =
        typeof bookingClientId === 'string' ? bookingClientId.trim() : '';

      if (!file || !clientId || (!cleanEventClientId && !cleanBookingClientId)) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Missing PDF file or metadata.' });
      }

      let eventId: number | null = null;
      let bookingId: number | null = null;
      let role: 'owner' | 'edit' | 'view' | null = null;

      if (cleanEventClientId) {
        const eventAccess = await getEventAccessByClientId(cleanEventClientId, userId);
        if (!eventAccess) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return res.status(404).json({ error: 'Parent event not found on server yet.' });
        }
        eventId = eventAccess.event.id;
        role = eventAccess.role;
      } else if (cleanBookingClientId) {
        const bookingAccess = await getBookingAccessByClientId(cleanBookingClientId, userId);
        if (!bookingAccess) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return res.status(404).json({ error: 'Parent booking not found on server yet.' });
        }
        bookingId = bookingAccess.booking.id;
        role = bookingAccess.role;
      }

      if (role === 'view' || !role) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(403).json({ error: 'View-only access: cannot upload PDFs to this trip.' });
      }

      const relativeDiskPath = path.relative(process.cwd(), file.path);

      const [saved] = await db
        .insert(pdfs)
        .values({
          clientId: String(clientId),
          eventClientId: cleanEventClientId,
          eventId,
          bookingClientId: cleanBookingClientId,
          bookingId,
          userId,
          filename: file.originalname || path.basename(file.path),
          mimeType: file.mimetype || 'application/pdf',
          sizeBytes: file.size,
          diskPath: relativeDiskPath,
          extractedText: String(extractedText || ''),
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: pdfs.clientId,
          set: {
            diskPath: relativeDiskPath,
            sizeBytes: file.size,
            extractedText: String(extractedText || ''),
            deletedAt: null,
          },
        })
        .returning();

      res.json(saved);
    } catch (error: unknown) {
      console.error('PDF upload failed:', error);
      res.status(500).json({ error: 'Failed to store PDF on disk.' });
    }
  });

  app.get('/api/pdfs/:clientId/file', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [pdf] = await db
        .select()
        .from(pdfs)
        .where(eq(pdfs.clientId, clientId))
        .limit(1);

      if (!pdf || pdf.deletedAt) {
        return res.status(404).json({ error: 'PDF not found.' });
      }

      const access = pdf.eventClientId
        ? await getEventAccessByClientId(pdf.eventClientId, userId)
        : pdf.bookingClientId
        ? await getBookingAccessByClientId(pdf.bookingClientId, userId)
        : null;
      if (!access) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const fullPath = resolveSafeUploadPath(pdf.diskPath);
      if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'PDF file missing on disk.' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdf.filename)}"`);
      fs.createReadStream(fullPath).pipe(res);
    } catch (error: unknown) {
      console.error('PDF download failed:', error);
      res.status(500).json({ error: 'Failed to stream PDF.' });
    }
  });

  app.delete('/api/pdfs/:clientId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [pdf] = await db
        .select()
        .from(pdfs)
        .where(eq(pdfs.clientId, clientId))
        .limit(1);

      if (!pdf) {
        return res.status(404).json({ error: 'PDF not found.' });
      }

      const access = pdf.eventClientId
        ? await getEventAccessByClientId(pdf.eventClientId, userId)
        : pdf.bookingClientId
        ? await getBookingAccessByClientId(pdf.bookingClientId, userId)
        : null;
      if (!access || access.role === 'view') {
        return res.status(403).json({ error: 'You do not have permission to delete this PDF.' });
      }

      await db
        .update(pdfs)
        .set({ deletedAt: new Date() })
        .where(eq(pdfs.id, pdf.id));

      const fullPath = resolveSafeUploadPath(pdf.diskPath);
      if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('PDF delete failed:', error);
      res.status(500).json({ error: 'Failed to delete PDF.' });
    }
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: `Uploaded file exceeds the server limit (${MAX_PHOTO_SIZE_MB} MB for photos, ${MAX_PDF_SIZE_MB} MB for PDFs).`,
          });
        }
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {}
if (globalThis.customElements && !globalThis.customElements.get("vite-error-overlay")) {
  globalThis.customElements.define("vite-error-overlay", ErrorOverlay);
}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TravelLog server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TravelLog server:', err);
  process.exit(1);
});
