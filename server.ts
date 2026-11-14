import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { and, eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import { events, pdfs, photos, trips } from './src/db/schema.ts';
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

function resolveSafeUploadPath(relativeDiskPath: string): string | null {
  const resolved = path.resolve(process.cwd(), relativeDiskPath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const authReq = req as AuthRequest;
      const uid = sanitizeSegment(authReq.user?.uid || 'anonymous');
      const dir = path.join(PHOTOS_DIR, uid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const clientId = sanitizeSegment(String(req.body?.clientId || Date.now()));
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

  app.get('/api/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const [userTrips, userEvents, userPhotos, userPdfs] = await Promise.all([
        db.select().from(trips).where(eq(trips.userId, userId)),
        db.select().from(events).where(eq(events.userId, userId)),
        db.select().from(photos).where(eq(photos.userId, userId)),
        db.select().from(pdfs).where(eq(pdfs.userId, userId)),
      ]);

      res.json({
        trips: userTrips,
        events: userEvents,
        photos: userPhotos,
        pdfs: userPdfs,
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
      const { clientId, title, destination, startDate, endDate, description, updatedAt, deletedAt } =
        req.body || {};

      if (!clientId || !title || !startDate || !endDate) {
        return res.status(400).json({ error: 'Missing required trip fields.' });
      }

      const existing = await db
        .select()
        .from(trips)
        .where(eq(trips.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = updatedAt ? new Date(updatedAt) : new Date();
      const deletedTimestamp = deletedAt ? new Date(deletedAt) : null;

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
            updatedAt: now,
            deletedAt: deletedTimestamp,
          },
        })
        .returning();

      res.json(saved);
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

      const [updated] = await db
        .update(trips)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(trips.clientId, clientId), eq(trips.userId, userId)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Trip not found.' });
      }

      await db
        .update(events)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(events.tripId, updated.id), eq(events.userId, userId)));

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

      const [parentTrip] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.clientId, String(tripClientId)), eq(trips.userId, userId)))
        .limit(1);

      if (!parentTrip) {
        return res.status(404).json({ error: 'Parent trip not found on server yet.' });
      }

      const existing = await db
        .select()
        .from(events)
        .where(eq(events.clientId, String(clientId)))
        .limit(1);

      if (existing.length > 0 && existing[0].userId !== userId) {
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
          tripId: parentTrip.id,
          userId,
          eventDate: String(eventDate),
          eventTime: String(eventTime || ''),
          location: String(location),
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
            tripId: parentTrip.id,
            eventDate: String(eventDate),
            eventTime: String(eventTime || ''),
            location: String(location),
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
      const now = new Date();

      const [updated] = await db
        .update(events)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(events.clientId, clientId), eq(events.userId, userId)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Event not found.' });
      }

      res.json({ deleted: true, clientId });
    } catch (error: unknown) {
      console.error('Event delete failed:', error);
      res.status(500).json({ error: 'Failed to delete event.' });
    }
  });

  app.post('/api/photos', requireAuth, photoUpload.single('file'), async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const file = req.file;
      const { clientId, eventClientId, caption } = req.body || {};

      if (!file || !clientId || !eventClientId) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Missing photo file or metadata.' });
      }

      const [parentEvent] = await db
        .select()
        .from(events)
        .where(and(eq(events.clientId, String(eventClientId)), eq(events.userId, userId)))
        .limit(1);

      if (!parentEvent) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(404).json({ error: 'Parent event not found on server yet.' });
      }

      const relativeDiskPath = path.relative(process.cwd(), file.path);

      const [saved] = await db
        .insert(photos)
        .values({
          clientId: String(clientId),
          eventClientId: String(eventClientId),
          eventId: parentEvent.id,
          userId,
          filename: file.originalname || path.basename(file.path),
          mimeType: file.mimetype || 'image/jpeg',
          sizeBytes: file.size,
          diskPath: relativeDiskPath,
          caption: String(caption || ''),
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: photos.clientId,
          set: {
            diskPath: relativeDiskPath,
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
  });

  app.get('/api/photos/:clientId/file', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUserId!;
      const clientId = String(req.params.clientId);
      const [photo] = await db
        .select()
        .from(photos)
        .where(and(eq(photos.clientId, clientId), eq(photos.userId, userId)))
        .limit(1);

      if (!photo || photo.deletedAt) {
        return res.status(404).json({ error: 'Photo not found.' });
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
        .where(and(eq(photos.clientId, clientId), eq(photos.userId, userId)))
        .limit(1);

      if (!photo) {
        return res.status(404).json({ error: 'Photo not found.' });
      }

      await db
        .update(photos)
        .set({ deletedAt: new Date() })
        .where(eq(photos.id, photo.id));

      const fullPath = resolveSafeUploadPath(photo.diskPath);
      if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
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
      const { clientId, eventClientId, extractedText } = req.body || {};

      if (!file || !clientId || !eventClientId) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Missing PDF file or metadata.' });
      }

      const [parentEvent] = await db
        .select()
        .from(events)
        .where(and(eq(events.clientId, String(eventClientId)), eq(events.userId, userId)))
        .limit(1);

      if (!parentEvent) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(404).json({ error: 'Parent event not found on server yet.' });
      }

      const relativeDiskPath = path.relative(process.cwd(), file.path);

      const [saved] = await db
        .insert(pdfs)
        .values({
          clientId: String(clientId),
          eventClientId: String(eventClientId),
          eventId: parentEvent.id,
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
        .where(and(eq(pdfs.clientId, clientId), eq(pdfs.userId, userId)))
        .limit(1);

      if (!pdf || pdf.deletedAt) {
        return res.status(404).json({ error: 'PDF not found.' });
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
        .where(and(eq(pdfs.clientId, clientId), eq(pdfs.userId, userId)))
        .limit(1);

      if (!pdf) {
        return res.status(404).json({ error: 'PDF not found.' });
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
    console.log(`Fieldlog server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Fieldlog server:', err);
  process.exit(1);
});
