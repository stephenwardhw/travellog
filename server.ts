import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { and, eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import { events, pdfs, photos, trips } from './src/db/schema.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';

const PORT = 3000;
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
  limits: { fileSize: 25 * 1024 * 1024 },
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
  limits: { fileSize: 35 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
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

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
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

startServer();
