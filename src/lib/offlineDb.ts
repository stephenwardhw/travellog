import type {
  EventRecord,
  PdfRecord,
  PhotoRecord,
  SyncQueueItem,
  TripRecord,
} from '../types/journal';

const DB_NAME = 'fieldlog_journal_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'clientId' });
      }
      if (!db.objectStoreNames.contains('events')) {
        const eventsStore = db.createObjectStore('events', { keyPath: 'clientId' });
        eventsStore.createIndex('byTrip', 'tripClientId', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photosStore = db.createObjectStore('photos', { keyPath: 'clientId' });
        photosStore.createIndex('byEvent', 'eventClientId', { unique: false });
      }
      if (!db.objectStoreNames.contains('pdfs')) {
        const pdfsStore = db.createObjectStore('pdfs', { keyPath: 'clientId' });
        pdfsStore.createIndex('byEvent', 'eventClientId', { unique: false });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const offlineDb = {
  async getAllTrips(): Promise<TripRecord[]> {
    const db = await openDb();
    const tx = db.transaction('trips', 'readonly');
    const items = await reqToPromise(tx.objectStore('trips').getAll());
    return (items as TripRecord[]).filter((t) => !t.deletedAt);
  },

  async getAllTripsRaw(): Promise<TripRecord[]> {
    const db = await openDb();
    const tx = db.transaction('trips', 'readonly');
    return reqToPromise(tx.objectStore('trips').getAll());
  },

  async getTripRaw(clientId: string): Promise<TripRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('trips', 'readonly');
    return reqToPromise(tx.objectStore('trips').get(clientId));
  },

  async putTrip(trip: TripRecord): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('trips', 'readwrite');
    tx.objectStore('trips').put(trip);
    await txDone(tx);
  },

  async deleteTrip(clientId: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('trips', 'readwrite');
    tx.objectStore('trips').delete(clientId);
    await txDone(tx);
  },

  async getAllEvents(): Promise<EventRecord[]> {
    const db = await openDb();
    const tx = db.transaction('events', 'readonly');
    const items = await reqToPromise(tx.objectStore('events').getAll());
    return (items as EventRecord[]).filter((e) => !e.deletedAt);
  },

  async getAllEventsRaw(): Promise<EventRecord[]> {
    const db = await openDb();
    const tx = db.transaction('events', 'readonly');
    return reqToPromise(tx.objectStore('events').getAll());
  },

  async getEventRaw(clientId: string): Promise<EventRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('events', 'readonly');
    return reqToPromise(tx.objectStore('events').get(clientId));
  },

  async putEvent(event: EventRecord): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('events', 'readwrite');
    tx.objectStore('events').put(event);
    await txDone(tx);
  },

  async deleteEvent(clientId: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('events', 'readwrite');
    tx.objectStore('events').delete(clientId);
    await txDone(tx);
  },

  async getAllPhotos(): Promise<PhotoRecord[]> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    const items = await reqToPromise(tx.objectStore('photos').getAll());
    return (items as PhotoRecord[]).filter((p) => !p.deletedAt);
  },

  async getAllPhotosRaw(): Promise<PhotoRecord[]> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    return reqToPromise(tx.objectStore('photos').getAll());
  },

  async getPhotoRaw(clientId: string): Promise<PhotoRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    return reqToPromise(tx.objectStore('photos').get(clientId));
  },

  async putPhoto(photo: PhotoRecord): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(photo);
    await txDone(tx);
  },

  async deletePhoto(clientId: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(clientId);
    await txDone(tx);
  },

  async getAllPdfs(): Promise<PdfRecord[]> {
    const db = await openDb();
    const tx = db.transaction('pdfs', 'readonly');
    const items = await reqToPromise(tx.objectStore('pdfs').getAll());
    return (items as PdfRecord[]).filter((p) => !p.deletedAt);
  },

  async getAllPdfsRaw(): Promise<PdfRecord[]> {
    const db = await openDb();
    const tx = db.transaction('pdfs', 'readonly');
    return reqToPromise(tx.objectStore('pdfs').getAll());
  },

  async getPdfRaw(clientId: string): Promise<PdfRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('pdfs', 'readonly');
    return reqToPromise(tx.objectStore('pdfs').get(clientId));
  },

  async putPdf(pdf: PdfRecord): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('pdfs', 'readwrite');
    tx.objectStore('pdfs').put(pdf);
    await txDone(tx);
  },

  async deletePdf(clientId: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('pdfs', 'readwrite');
    tx.objectStore('pdfs').delete(clientId);
    await txDone(tx);
  },

  async getQueue(): Promise<SyncQueueItem[]> {
    const db = await openDb();
    const tx = db.transaction('syncQueue', 'readonly');
    return reqToPromise(tx.objectStore('syncQueue').getAll());
  },

  async enqueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').add(item);
    await txDone(tx);
  },

  async removeQueueItem(id: number): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').delete(id);
    await txDone(tx);
  },

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    const db = await openDb();
    const tx = db.transaction('meta', 'readonly');
    const res = await reqToPromise(tx.objectStore('meta').get(key));
    return res ? (res.value as T) : undefined;
  },

  async setMeta<T = unknown>(key: string, value: T): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await txDone(tx);
  },

  async clearAllUserData(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(
      ['trips', 'events', 'photos', 'pdfs', 'syncQueue', 'meta'],
      'readwrite'
    );
    tx.objectStore('trips').clear();
    tx.objectStore('events').clear();
    tx.objectStore('photos').clear();
    tx.objectStore('pdfs').clear();
    tx.objectStore('syncQueue').clear();
    tx.objectStore('meta').clear();
    await txDone(tx);
  },
};
