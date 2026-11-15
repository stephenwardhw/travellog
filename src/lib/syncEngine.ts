import { readNetworkState } from './network';
import { offlineDb } from './offlineDb';
import type { EventRecord, PdfRecord, PhotoRecord, TripRecord } from '../types/journal';

export interface SyncResult {
  status: 'synced' | 'offline' | 'paused-cellular' | 'unauthorized' | 'error';
  pushedCount: number;
  downloadedMediaCount: number;
  errorMessage?: string;
}

let activeSyncPromise: Promise<SyncResult> | null = null;

export async function runFullSync(token: string, wifiOnlySync: boolean): Promise<SyncResult> {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    const net = readNetworkState();
    if (!net.isOnline) {
      return { status: 'offline', pushedCount: 0, downloadedMediaCount: 0 };
    }
    if (wifiOnlySync && !net.isWifiReady) {
      return { status: 'paused-cellular', pushedCount: 0, downloadedMediaCount: 0 };
    }

    let pushedCount = 0;
    let downloadedMediaCount = 0;

    try {
      const authHeaders = {
        Authorization: `Bearer ${token}`,
      };

      const assertAuthorized = (res: Response) => {
        if (res.status === 401) {
          throw new Error('SESSION_UNAUTHORIZED');
        }
      };

      let permissionErrorNotice: string | undefined;
      const checkResponse = async (res: Response, queueItemId: number, label: string): Promise<boolean> => {
        assertAuthorized(res);
        if (res.status === 403) {
          await offlineDb.removeQueueItem(queueItemId);
          permissionErrorNotice = `Some changes to a shared trip were discarded because you only have view access.`;
          return false;
        }
        if (!res.ok) {
          throw new Error(`Failed to sync ${label} (${res.status})`);
        }
        return true;
      };

      // 1. Push pending local mutations in FIFO order
      const queue = await offlineDb.getQueue();
      for (const item of queue) {
        if (!item.id) continue;

        if (item.type === 'trip_upsert') {
          const trip = await offlineDb.getTripRaw(item.clientId);
          if (!trip) {
            await offlineDb.removeQueueItem(item.id);
            continue;
          }
          const res = await fetch('/api/trips/upsert', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(trip),
          });
          if (!(await checkResponse(res, item.id, 'trip'))) continue;
          await offlineDb.putTrip({ ...trip, syncStatus: 'synced' });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'trip_delete') {
          const res = await fetch(`/api/trips/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          if (res.status !== 404 && !(await checkResponse(res, item.id, 'trip deletion'))) continue;
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'event_upsert') {
          const event = await offlineDb.getEventRaw(item.clientId);
          if (!event) {
            await offlineDb.removeQueueItem(item.id);
            continue;
          }
          const res = await fetch('/api/events/upsert', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          });
          if (!(await checkResponse(res, item.id, 'stop'))) continue;
          await offlineDb.putEvent({ ...event, syncStatus: 'synced' });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'event_delete') {
          const res = await fetch(`/api/events/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          if (res.status !== 404 && !(await checkResponse(res, item.id, 'stop deletion'))) continue;
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'photo_upload') {
          const photo = await offlineDb.getPhotoRaw(item.clientId);
          if (!photo || !photo.blob || photo.deletedAt) {
            await offlineDb.removeQueueItem(item.id);
            continue;
          }
          const form = new FormData();
          form.append('clientId', photo.clientId);
          form.append('eventClientId', photo.eventClientId);
          form.append('caption', photo.caption || '');
          form.append('file', photo.blob, photo.filename);
          if (photo.thumbBlob) {
            form.append('thumb', photo.thumbBlob, `${photo.clientId}.jpg`);
          }

          const res = await fetch('/api/photos', {
            method: 'POST',
            headers: authHeaders,
            body: form,
          });
          if (!(await checkResponse(res, item.id, 'photo'))) continue;
          const savedMeta = await res.json();
          await offlineDb.putPhoto({
            ...photo,
            diskPath: savedMeta.diskPath,
            thumbDiskPath: savedMeta.thumbDiskPath,
            hasLocalFile: true,
            syncStatus: 'synced',
          });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'photo_delete') {
          const res = await fetch(`/api/photos/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          if (res.status !== 404 && !(await checkResponse(res, item.id, 'photo deletion'))) continue;
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'pdf_upload') {
          const pdf = await offlineDb.getPdfRaw(item.clientId);
          if (!pdf || !pdf.blob || pdf.deletedAt) {
            await offlineDb.removeQueueItem(item.id);
            continue;
          }
          const form = new FormData();
          form.append('clientId', pdf.clientId);
          form.append('eventClientId', pdf.eventClientId);
          form.append('extractedText', pdf.extractedText || '');
          form.append('file', pdf.blob, pdf.filename);

          const res = await fetch('/api/pdfs', {
            method: 'POST',
            headers: authHeaders,
            body: form,
          });
          if (!(await checkResponse(res, item.id, 'PDF'))) continue;
          const savedMeta = await res.json();
          await offlineDb.putPdf({
            ...pdf,
            diskPath: savedMeta.diskPath,
            hasLocalFile: true,
            syncStatus: 'synced',
          });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'pdf_delete') {
          const res = await fetch(`/api/pdfs/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          if (res.status !== 404 && !(await checkResponse(res, item.id, 'PDF deletion'))) continue;
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        }
      }

      // 2. Pull remote metadata from PostgreSQL
      const pullRes = await fetch('/api/sync', { headers: authHeaders });
      assertAuthorized(pullRes);
      if (!pullRes.ok) {
        throw new Error(`Failed to pull remote journal (${pullRes.status})`);
      }

      const payload: {
        trips: TripRecord[];
        events: EventRecord[];
        photos: PhotoRecord[];
        pdfs: PdfRecord[];
      } = await pullRes.json();

      const remainingQueue = await offlineDb.getQueue();
      const pendingIds = new Set(remainingQueue.map((q) => q.clientId));

      const remoteTripIds = new Set(payload.trips.map((t) => t.clientId));
      const remoteEventIds = new Set(payload.events.map((e) => e.clientId));
      const remotePhotoIds = new Set(payload.photos.map((p) => p.clientId));
      const remotePdfIds = new Set(payload.pdfs.map((p) => p.clientId));

      for (const remoteTrip of payload.trips) {
        if (pendingIds.has(remoteTrip.clientId)) continue;
        await offlineDb.putTrip({
          clientId: remoteTrip.clientId,
          title: remoteTrip.title,
          destination: remoteTrip.destination,
          startDate: remoteTrip.startDate,
          endDate: remoteTrip.endDate,
          description: remoteTrip.description,
          updatedAt: remoteTrip.updatedAt,
          createdAt: remoteTrip.createdAt,
          deletedAt: remoteTrip.deletedAt,
          accessRole: remoteTrip.accessRole || 'owner',
          ownerName: remoteTrip.ownerName || '',
          ownerEmail: remoteTrip.ownerEmail || '',
          syncStatus: 'synced',
        });
      }

      for (const remoteEvent of payload.events) {
        if (pendingIds.has(remoteEvent.clientId)) continue;
        await offlineDb.putEvent({
          clientId: remoteEvent.clientId,
          tripClientId: remoteEvent.tripClientId,
          eventDate: remoteEvent.eventDate,
          eventTime: remoteEvent.eventTime,
          location: remoteEvent.location,
          latitude: remoteEvent.latitude,
          longitude: remoteEvent.longitude,
          details: remoteEvent.details,
          journalEntry: remoteEvent.journalEntry,
          updatedAt: remoteEvent.updatedAt,
          createdAt: remoteEvent.createdAt,
          deletedAt: remoteEvent.deletedAt,
          syncStatus: 'synced',
        });
      }

      // 3. Download missing photos & PDFs onto this device (over Wi-Fi)
      for (const remotePhoto of payload.photos) {
        if (pendingIds.has(remotePhoto.clientId)) continue;
        const existing = await offlineDb.getPhotoRaw(remotePhoto.clientId);
        if (remotePhoto.deletedAt) {
          await offlineDb.putPhoto({
            ...remotePhoto,
            blob: undefined,
            thumbBlob: undefined,
            hasLocalFile: false,
            syncStatus: 'synced',
          });
          continue;
        }

        let thumbBlob = existing?.thumbBlob;
        if (!thumbBlob) {
          const latestNet = readNetworkState();
          if (!wifiOnlySync || latestNet.isWifiReady) {
            const thumbRes = await fetch(
              `/api/photos/${encodeURIComponent(remotePhoto.clientId)}/thumb`,
              { headers: authHeaders }
            );
            if (thumbRes.ok) {
              thumbBlob = await thumbRes.blob();
            }
          }
        }

        let blob = existing?.blob;
        if (!blob) {
          const latestNet = readNetworkState();
          if (!wifiOnlySync || latestNet.isWifiReady) {
            const fileRes = await fetch(
              `/api/photos/${encodeURIComponent(remotePhoto.clientId)}/file`,
              { headers: authHeaders }
            );
            if (fileRes.ok) {
              blob = await fileRes.blob();
              downloadedMediaCount++;
            }
          }
        }

        await offlineDb.putPhoto({
          clientId: remotePhoto.clientId,
          eventClientId: remotePhoto.eventClientId,
          filename: remotePhoto.filename,
          mimeType: remotePhoto.mimeType,
          sizeBytes: remotePhoto.sizeBytes,
          diskPath: remotePhoto.diskPath,
          thumbDiskPath: remotePhoto.thumbDiskPath,
          caption: remotePhoto.caption,
          createdAt: remotePhoto.createdAt,
          deletedAt: null,
          blob,
          thumbBlob,
          hasLocalFile: Boolean(blob),
          syncStatus: 'synced',
        });
      }

      for (const remotePdf of payload.pdfs) {
        if (pendingIds.has(remotePdf.clientId)) continue;
        const existing = await offlineDb.getPdfRaw(remotePdf.clientId);
        if (remotePdf.deletedAt) {
          await offlineDb.putPdf({
            ...remotePdf,
            blob: undefined,
            hasLocalFile: false,
            syncStatus: 'synced',
          });
          continue;
        }

        let blob = existing?.blob;
        if (!blob) {
          const latestNet = readNetworkState();
          if (!wifiOnlySync || latestNet.isWifiReady) {
            const fileRes = await fetch(
              `/api/pdfs/${encodeURIComponent(remotePdf.clientId)}/file`,
              { headers: authHeaders }
            );
            if (fileRes.ok) {
              blob = await fileRes.blob();
              downloadedMediaCount++;
            }
          }
        }

        await offlineDb.putPdf({
          clientId: remotePdf.clientId,
          eventClientId: remotePdf.eventClientId,
          filename: remotePdf.filename,
          mimeType: remotePdf.mimeType,
          sizeBytes: remotePdf.sizeBytes,
          diskPath: remotePdf.diskPath,
          extractedText: remotePdf.extractedText,
          createdAt: remotePdf.createdAt,
          deletedAt: null,
          blob,
          hasLocalFile: Boolean(blob),
          syncStatus: 'synced',
        });
      }

      // Remove local synced items that are no longer accessible (e.g., revoked shares)
      const [localTrips, localEvents, localPhotos, localPdfs] = await Promise.all([
        offlineDb.getAllTripsRaw(),
        offlineDb.getAllEventsRaw(),
        offlineDb.getAllPhotosRaw(),
        offlineDb.getAllPdfsRaw(),
      ]);

      for (const t of localTrips) {
        if (!pendingIds.has(t.clientId) && !remoteTripIds.has(t.clientId)) {
          await offlineDb.deleteTrip(t.clientId);
        }
      }
      for (const ev of localEvents) {
        if (!pendingIds.has(ev.clientId) && !remoteEventIds.has(ev.clientId)) {
          await offlineDb.deleteEvent(ev.clientId);
        }
      }
      for (const ph of localPhotos) {
        if (!pendingIds.has(ph.clientId) && !remotePhotoIds.has(ph.clientId)) {
          await offlineDb.deletePhoto(ph.clientId);
        }
      }
      for (const pd of localPdfs) {
        if (!pendingIds.has(pd.clientId) && !remotePdfIds.has(pd.clientId)) {
          await offlineDb.deletePdf(pd.clientId);
        }
      }

      await offlineDb.setMeta('lastSyncAt', new Date().toISOString());

      return {
        status: 'synced',
        pushedCount,
        downloadedMediaCount,
        errorMessage: permissionErrorNotice,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Sync failed';
      if (msg === 'SESSION_UNAUTHORIZED') {
        return {
          status: 'unauthorized',
          pushedCount,
          downloadedMediaCount,
        };
      }
      return {
        status: 'error',
        pushedCount,
        downloadedMediaCount,
        errorMessage: msg,
      };
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
