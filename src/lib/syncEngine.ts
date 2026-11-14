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
          assertAuthorized(res);
          if (!res.ok) throw new Error(`Failed to sync trip (${res.status})`);
          await offlineDb.putTrip({ ...trip, syncStatus: 'synced' });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'trip_delete') {
          const res = await fetch(`/api/trips/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          assertAuthorized(res);
          if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete trip (${res.status})`);
          }
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
          assertAuthorized(res);
          if (!res.ok) throw new Error(`Failed to sync stop (${res.status})`);
          await offlineDb.putEvent({ ...event, syncStatus: 'synced' });
          await offlineDb.removeQueueItem(item.id);
          pushedCount++;
        } else if (item.type === 'event_delete') {
          const res = await fetch(`/api/events/${encodeURIComponent(item.clientId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          assertAuthorized(res);
          if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete stop (${res.status})`);
          }
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
          assertAuthorized(res);
          if (!res.ok) throw new Error(`Failed to upload photo (${res.status})`);
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
          assertAuthorized(res);
          if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete photo (${res.status})`);
          }
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
          assertAuthorized(res);
          if (!res.ok) throw new Error(`Failed to upload PDF (${res.status})`);
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
          assertAuthorized(res);
          if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete PDF (${res.status})`);
          }
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

      await offlineDb.setMeta('lastSyncAt', new Date().toISOString());

      return {
        status: 'synced',
        pushedCount,
        downloadedMediaCount,
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
