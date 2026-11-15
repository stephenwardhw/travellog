import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Edit3,
  FileSpreadsheet,
  ListTodo,
  LogOut,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Share2,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { offlineDb } from './lib/offlineDb';
import { useNetworkStatus } from './lib/network';
import { runFullSync } from './lib/syncEngine';
import { generateThumbnailBlob } from './lib/imageThumb';
import type { ParsedCsvStop } from './lib/csvParser';
import type {
  AppView,
  AuthSession,
  EventRecord,
  PdfRecord,
  PhotoRecord,
  TripRecord,
} from './types/journal';
import { AuthGate } from './components/AuthGate';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { AgendaView } from './components/AgendaView';
import { CalendarView } from './components/CalendarView';
import { CartoMapView } from './components/CartoMapView';
import { SearchView } from './components/SearchView';
import { AdminUsersView } from './components/AdminUsersView';
import { TripModal } from './components/TripModal';
import { TripShareModal } from './components/TripShareModal';
import { CsvImportModal } from './components/CsvImportModal';
import { EventDetailDrawer } from './components/EventDetailDrawer';
import { PhotoLightbox } from './components/PhotoLightbox';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [view, setView] = useState<AppView>('agenda');
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [pdfs, setPdfs] = useState<PdfRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTripClientId, setActiveTripClientId] = useState<string | null>(null);

  const [wifiOnlySync, setWifiOnlySync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripRecord | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [drawerDefaultDate, setDrawerDefaultDate] = useState<string | undefined>(undefined);
  const [drawerDefaultCoords, setDrawerDefaultCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    photos: PhotoRecord[];
    initialIndex: number;
    title?: string;
  } | null>(null);

  const network = useNetworkStatus();

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const loadFromLocalDb = useCallback(async () => {
    const [allTrips, allEvents, allPhotos, allPdfs, queue, savedTripId, savedWifiOnly, savedSyncAt] =
      await Promise.all([
        offlineDb.getAllTrips(),
        offlineDb.getAllEvents(),
        offlineDb.getAllPhotos(),
        offlineDb.getAllPdfs(),
        offlineDb.getQueue(),
        offlineDb.getMeta<string>('activeTripClientId'),
        offlineDb.getMeta<boolean>('wifiOnlySync'),
        offlineDb.getMeta<string>('lastSyncAt'),
      ]);

    const sortedTrips = [...allTrips].sort((a, b) => b.startDate.localeCompare(a.startDate));
    setTrips(sortedTrips);
    setEvents(allEvents);
    setPhotos(allPhotos);
    setPdfs(allPdfs);
    setPendingCount(queue.length);

    if (typeof savedWifiOnly === 'boolean') {
      setWifiOnlySync(savedWifiOnly);
    }
    if (savedSyncAt) {
      setLastSyncAt(savedSyncAt);
    }

    setActiveTripClientId((prev) => {
      const candidate = prev || savedTripId;
      if (candidate && sortedTrips.some((t) => t.clientId === candidate)) {
        return candidate;
      }
      return sortedTrips[0]?.clientId || null;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await offlineDb.setMeta('authSession', null);
    setSession(null);
    setView('agenda');
  }, []);

  const handleAuthenticated = useCallback(
    async (nextSession: AuthSession) => {
      const previousUid = await offlineDb.getMeta<string>('userUid');
      if (previousUid && previousUid !== nextSession.user.uid) {
        await offlineDb.clearAllUserData();
      }
      await offlineDb.setMeta('userUid', nextSession.user.uid);
      await offlineDb.setMeta('authSession', nextSession);
      await loadFromLocalDb();
      setSession(nextSession);
      setView('agenda');
      setAuthReady(true);
    },
    [loadFromLocalDb]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const savedSession = await offlineDb.getMeta<AuthSession | null>('authSession');
        if (!active) return;

        if (savedSession?.token && savedSession?.user) {
          await loadFromLocalDb();
          if (!active) return;
          setSession(savedSession);
          setAuthReady(true);

          if (navigator.onLine) {
            try {
              const res = await fetch('/api/auth/me', {
                headers: { Authorization: `Bearer ${savedSession.token}` },
              });
              if (!active) return;
              if (res.status === 401) {
                await handleSignOut();
                return;
              }
              if (res.ok) {
                const data = await res.json();
                if (data?.user && active) {
                  const updatedSession: AuthSession = {
                    token: savedSession.token,
                    user: data.user,
                  };
                  await offlineDb.setMeta('authSession', updatedSession);
                  setSession(updatedSession);
                }
              }
            } catch {
              // Offline or server unreachable; retain cached offline session
            }
          }
        } else {
          setAuthReady(true);
        }
      } catch {
        if (active) setAuthReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadFromLocalDb, handleSignOut]);

  const triggerSync = useCallback(
    async (explicitSession?: AuthSession | null, explicitWifiOnly?: boolean) => {
      const targetSession = explicitSession ?? session;
      const targetWifiOnly = explicitWifiOnly ?? wifiOnlySync;
      if (!targetSession) return;

      setIsSyncing(true);
      setSyncNotice(null);
      try {
        const result = await runFullSync(targetSession.token, targetWifiOnly);
        if (result.status === 'unauthorized') {
          await handleSignOut();
          return;
        }
        await loadFromLocalDb();
        if (result.status === 'paused-cellular') {
          setSyncNotice('Cellular connection detected — media & data sync paused until Wi-Fi.');
        } else if (result.errorMessage) {
          setSyncNotice(result.errorMessage);
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [session, wifiOnlySync, loadFromLocalDb, handleSignOut]
  );

  // Auto-sync when online + Wi-Fi condition is met
  useEffect(() => {
    if (!session) return;
    if (network.isOnline && (!wifiOnlySync || network.isWifiReady)) {
      triggerSync(session, wifiOnlySync);
    }
  }, [session?.token, network.isOnline, network.isWifiReady, wifiOnlySync, triggerSync]);

  useEffect(() => {
    if (session && session.user.role !== 'admin' && view === 'admin') {
      setView('agenda');
    }
  }, [session, view]);

  const activeTrip = useMemo(
    () => trips.find((t) => t.clientId === activeTripClientId) || trips[0] || null,
    [trips, activeTripClientId]
  );

  const activeTripRole = activeTrip?.accessRole || 'owner';
  const isActiveTripOwner = !activeTrip || activeTripRole === 'owner';
  const canEditActiveTrip = !activeTrip || activeTripRole === 'owner' || activeTripRole === 'edit';

  const canEditTripById = useCallback(
    (tripClientId: string) => {
      const target = trips.find((t) => t.clientId === tripClientId);
      const role = target?.accessRole || 'owner';
      return role === 'owner' || role === 'edit';
    },
    [trips]
  );

  const activeTripEvents = useMemo(() => {
    if (!activeTrip) return [];
    return events.filter((e) => e.tripClientId === activeTrip.clientId);
  }, [events, activeTrip]);

  const photosByEvent = useMemo(() => {
    const map = new Map<string, PhotoRecord[]>();
    for (const p of photos) {
      const list = map.get(p.eventClientId) || [];
      list.push(p);
      map.set(p.eventClientId, list);
    }
    return map;
  }, [photos]);

  const pdfsByEvent = useMemo(() => {
    const map = new Map<string, PdfRecord[]>();
    for (const p of pdfs) {
      const list = map.get(p.eventClientId) || [];
      list.push(p);
      map.set(p.eventClientId, list);
    }
    return map;
  }, [pdfs]);

  const selectActiveTrip = async (clientId: string) => {
    setActiveTripClientId(clientId);
    await offlineDb.setMeta('activeTripClientId', clientId);
  };

  const handleSaveTrip = async (data: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    description: string;
  }) => {
    if (editingTrip && editingTrip.accessRole === 'view') {
      setSyncNotice('This shared trip is view-only and cannot be modified.');
      return;
    }
    const now = new Date().toISOString();
    const record: TripRecord = editingTrip
      ? {
          ...editingTrip,
          ...data,
          updatedAt: now,
          syncStatus: 'pending',
        }
      : {
          clientId: makeId(),
          ...data,
          accessRole: 'owner',
          ownerName: session?.user.name || session?.user.email || '',
          ownerEmail: session?.user.email || '',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'pending',
        };

    await offlineDb.putTrip(record);
    await offlineDb.enqueue({
      type: 'trip_upsert',
      clientId: record.clientId,
      createdAt: now,
    });
    await selectActiveTrip(record.clientId);
    await loadFromLocalDb();
    triggerSync();
  };

  const handleDeleteTrip = async (trip: TripRecord) => {
    if (trip.accessRole && trip.accessRole !== 'owner') {
      setSyncNotice('Only the trip owner can delete a trip.');
      return;
    }
    const now = new Date().toISOString();
    await offlineDb.putTrip({
      ...trip,
      deletedAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await offlineDb.enqueue({
      type: 'trip_delete',
      clientId: trip.clientId,
      createdAt: now,
    });
    await loadFromLocalDb();
    triggerSync();
  };

  const handleCsvImport = async (opts: {
    targetTripClientId: string | 'new';
    newTripTitle?: string;
    rows: ParsedCsvStop[];
  }) => {
    const now = new Date().toISOString();
    let targetTripId = opts.targetTripClientId;

    if (targetTripId === 'new') {
      const sortedDates = opts.rows.map((r) => r.eventDate).sort();
      const newTrip: TripRecord = {
        clientId: makeId(),
        title: opts.newTripTitle || 'Imported Trip',
        destination: opts.rows[0]?.location || '',
        startDate: sortedDates[0] || now.slice(0, 10),
        endDate: sortedDates[sortedDates.length - 1] || now.slice(0, 10),
        description: `Imported from CSV (${opts.rows.length} stops)`,
        accessRole: 'owner',
        ownerName: session?.user.name || session?.user.email || '',
        ownerEmail: session?.user.email || '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      };
      await offlineDb.putTrip(newTrip);
      await offlineDb.enqueue({
        type: 'trip_upsert',
        clientId: newTrip.clientId,
        createdAt: now,
      });
      targetTripId = newTrip.clientId;
      await selectActiveTrip(targetTripId);
    } else if (!canEditTripById(targetTripId)) {
      throw new Error('You do not have edit permission for the selected trip.');
    }

    for (const row of opts.rows) {
      const ev: EventRecord = {
        clientId: makeId(),
        tripClientId: targetTripId,
        eventDate: row.eventDate,
        eventTime: row.eventTime,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        details: row.details,
        journalEntry: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      };
      await offlineDb.putEvent(ev);
      await offlineDb.enqueue({
        type: 'event_upsert',
        clientId: ev.clientId,
        createdAt: now,
      });
    }

    await loadFromLocalDb();
    triggerSync();
  };

  const handleSaveEvent = async (data: {
    clientId?: string;
    eventDate: string;
    eventTime: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    details: string;
    journalEntry: string;
  }): Promise<EventRecord> => {
    const now = new Date().toISOString();
    let tripId = activeTrip?.clientId;

    if (!tripId) {
      const fallbackTrip: TripRecord = {
        clientId: makeId(),
        title: 'My Travel Journal',
        destination: data.location,
        startDate: data.eventDate,
        endDate: data.eventDate,
        description: '',
        accessRole: 'owner',
        ownerName: session?.user.name || session?.user.email || '',
        ownerEmail: session?.user.email || '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      };
      await offlineDb.putTrip(fallbackTrip);
      await offlineDb.enqueue({
        type: 'trip_upsert',
        clientId: fallbackTrip.clientId,
        createdAt: now,
      });
      tripId = fallbackTrip.clientId;
      await selectActiveTrip(tripId);
    }

    const existing = data.clientId ? await offlineDb.getEventRaw(data.clientId) : undefined;
    const effectiveTripId = existing?.tripClientId || tripId;
    if (!canEditTripById(effectiveTripId) && activeTrip?.clientId === effectiveTripId && !canEditActiveTrip) {
      throw new Error('This shared trip is view-only and cannot be edited.');
    }
    const saved: EventRecord = {
      clientId: existing?.clientId || data.clientId || makeId(),
      tripClientId: effectiveTripId,
      eventDate: data.eventDate,
      eventTime: data.eventTime,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      details: data.details,
      journalEntry: data.journalEntry,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    };

    await offlineDb.putEvent(saved);
    await offlineDb.enqueue({
      type: 'event_upsert',
      clientId: saved.clientId,
      createdAt: now,
    });
    setSelectedEvent(saved);
    await loadFromLocalDb();
    triggerSync();
    return saved;
  };

  const handleDeleteEvent = async (clientId: string) => {
    const existing = await offlineDb.getEventRaw(clientId);
    if (!existing) return;
    if (!canEditTripById(existing.tripClientId)) return;
    const now = new Date().toISOString();
    await offlineDb.putEvent({
      ...existing,
      deletedAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await offlineDb.enqueue({
      type: 'event_delete',
      clientId,
      createdAt: now,
    });
    await loadFromLocalDb();
    triggerSync();
  };

  const handleAssignCoordinates = async (event: EventRecord, lat: number, lng: number) => {
    if (!canEditTripById(event.tripClientId)) return;
    const now = new Date().toISOString();
    const updated: EventRecord = {
      ...event,
      latitude: lat,
      longitude: lng,
      updatedAt: now,
      syncStatus: 'pending',
    };
    await offlineDb.putEvent(updated);
    await offlineDb.enqueue({
      type: 'event_upsert',
      clientId: updated.clientId,
      createdAt: now,
    });
    await loadFromLocalDb();
    triggerSync();
  };

  const handleAddPhotos = async (eventClientId: string, fileList: FileList) => {
    const now = new Date().toISOString();
    for (const file of Array.from(fileList)) {
      const thumbBlob = await generateThumbnailBlob(file);
      const photo: PhotoRecord = {
        clientId: makeId(),
        eventClientId,
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        caption: '',
        createdAt: now,
        deletedAt: null,
        blob: file,
        thumbBlob,
        hasLocalFile: true,
        syncStatus: 'pending',
      };
      await offlineDb.putPhoto(photo);
      await offlineDb.enqueue({
        type: 'photo_upload',
        clientId: photo.clientId,
        createdAt: now,
      });
    }
    await loadFromLocalDb();
    triggerSync();
  };

  const handleDeletePhoto = async (clientId: string) => {
    const existing = await offlineDb.getPhotoRaw(clientId);
    if (!existing) return;
    const now = new Date().toISOString();
    await offlineDb.putPhoto({
      ...existing,
      deletedAt: now,
      blob: undefined,
      thumbBlob: undefined,
      hasLocalFile: false,
      syncStatus: 'pending',
    });
    await offlineDb.enqueue({
      type: 'photo_delete',
      clientId,
      createdAt: now,
    });
    await loadFromLocalDb();
    triggerSync();
  };

  const handleCacheFullPhoto = useCallback(
    async (clientId: string, blob: Blob) => {
      const existing = await offlineDb.getPhotoRaw(clientId);
      if (!existing || existing.deletedAt) return;
      await offlineDb.putPhoto({
        ...existing,
        blob,
        hasLocalFile: true,
      });
      await loadFromLocalDb();
    },
    [loadFromLocalDb]
  );

  const handleAddPdfs = async (
    eventClientId: string,
    items: Array<{ file: File; extractedText: string }>
  ) => {
    const now = new Date().toISOString();
    for (const { file, extractedText } of items) {
      const pdf: PdfRecord = {
        clientId: makeId(),
        eventClientId,
        filename: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        extractedText,
        createdAt: now,
        deletedAt: null,
        blob: file,
        hasLocalFile: true,
        syncStatus: 'pending',
      };
      await offlineDb.putPdf(pdf);
      await offlineDb.enqueue({
        type: 'pdf_upload',
        clientId: pdf.clientId,
        createdAt: now,
      });
    }
    await loadFromLocalDb();
    triggerSync();
  };

  const handleDeletePdf = async (clientId: string) => {
    const existing = await offlineDb.getPdfRaw(clientId);
    if (!existing) return;
    const now = new Date().toISOString();
    await offlineDb.putPdf({
      ...existing,
      deletedAt: now,
      blob: undefined,
      hasLocalFile: false,
      syncStatus: 'pending',
    });
    await offlineDb.enqueue({
      type: 'pdf_delete',
      clientId,
      createdAt: now,
    });
    await loadFromLocalDb();
    triggerSync();
  };

  const toggleWifiOnly = async () => {
    const next = !wifiOnlySync;
    setWifiOnlySync(next);
    await offlineDb.setMeta('wifiOnlySync', next);
    if (session && network.isOnline && (!next || network.isWifiReady)) {
      triggerSync(session, next);
    }
  };

  const openNewStop = (defaultDate?: string, coords?: { lat: number; lng: number }) => {
    if (!activeTrip && !defaultDate) {
      setEditingTrip(null);
      setTripModalOpen(true);
      return;
    }
    if (activeTrip && !canEditActiveTrip) {
      setEditingTrip(null);
      setTripModalOpen(true);
      return;
    }
    setSelectedEvent(null);
    setDrawerDefaultDate(defaultDate || activeTrip?.startDate);
    setDrawerDefaultCoords(coords || null);
    setDrawerOpen(true);
  };

  const openExistingEvent = (ev: EventRecord) => {
    setSelectedEvent(ev);
    setDrawerDefaultDate(undefined);
    setDrawerDefaultCoords(null);
    setDrawerOpen(true);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading journal...
      </div>
    );
  }

  if (!session) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  const isAdmin = session.user.role === 'admin';

  const activeDrawerPhotos = selectedEvent ? photosByEvent.get(selectedEvent.clientId) || [] : [];
  const activeDrawerPdfs = selectedEvent ? pdfsByEvent.get(selectedEvent.clientId) || [] : [];
  const drawerTrip = selectedEvent
    ? trips.find((t) => t.clientId === selectedEvent.tripClientId) || activeTrip
    : activeTrip;
  const drawerReadOnly = (drawerTrip?.accessRole || 'owner') === 'view';
  const drawerOwnerLabel = drawerTrip?.ownerName || drawerTrip?.ownerEmail || '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-20 md:pb-10">
      <OfflineIndicator pendingCount={pendingCount} />

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#agenda"
            onClick={(e) => {
              e.preventDefault();
              setView('agenda');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Fieldlog
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['agenda', 'Agenda'],
                ['calendar', 'Calendar'],
                ['map', 'Map'],
                ['search', 'Search'],
                ...(isAdmin ? ([['admin', 'Admin']] as const) : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  view === key
                    ? 'border-teal-700 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => openNewStop()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5" />
              {activeTrip && canEditActiveTrip ? 'New Stop' : 'New Trip'}
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Toolbar */}
      <section className="border-b border-slate-200 bg-white">
        {/* Mobile Single-Line Toolbar + Actions Dropdown */}
        <div className="lg:hidden max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <select
            aria-label="Active trip"
            value={activeTrip?.clientId || ''}
            onChange={(e) => selectActiveTrip(e.target.value)}
            disabled={trips.length === 0}
            className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
          >
            {trips.length === 0 ? (
              <option value="">No trips created yet</option>
            ) : (
              trips.map((t) => (
                <option key={t.clientId} value={t.clientId}>
                  {t.title}
                  {t.accessRole === 'view'
                    ? ' (Shared · View)'
                    : t.accessRole === 'edit'
                    ? ' (Shared · Edit)'
                    : ''}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => triggerSync()}
            disabled={isSyncing || !network.isOnline}
            aria-label={
              isSyncing
                ? 'Syncing'
                : pendingCount > 0
                ? `Sync ${pendingCount} pending changes`
                : 'Sync now'
            }
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0 min-h-[40px] min-w-[40px] tabular-nums"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {pendingCount > 0 && <span>{pendingCount}</span>}
          </button>

          <div ref={mobileMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
            >
              <span>Actions</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                  mobileMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {mobileMenuOpen && (
              <div
                role="menu"
                aria-label="Trip and sync actions"
                className="absolute right-0 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-40"
              >
                <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Trip
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setEditingTrip(null);
                    setTripModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  New Trip
                </button>

                {activeTrip && isActiveTripOwner && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShareModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Share2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    Share Trip
                  </button>
                )}

                {activeTrip && canEditActiveTrip && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setEditingTrip(activeTrip);
                      setTripModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Edit Trip
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setCsvModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  Import CSV
                </button>

                {activeTrip && isActiveTripOwner && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleDeleteTrip(activeTrip);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Delete Trip
                  </button>
                )}

                <div className="my-1 border-t border-slate-100" />
                <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Sync & Account
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    toggleWifiOnly();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    {network.isOnline ? (
                      <Wifi className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    )}
                    Wi-Fi Only Sync
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      wifiOnlySync ? 'text-teal-700' : 'text-slate-400'
                    }`}
                  >
                    {wifiOnlySync ? 'On' : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={isSyncing || !network.isOnline}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    triggerSync();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing
                    ? 'Syncing...'
                    : pendingCount > 0
                    ? `Sync Now (${pendingCount})`
                    : 'Sync Now'}
                </button>

                <PWAInstallButton
                  variant="menu-item"
                  onComplete={() => setMobileMenuOpen(false)}
                />

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    Sign out
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                    {session.user.email}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Full Toolbar */}
        <div className="hidden lg:flex max-w-7xl mx-auto px-6 py-3 items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Active trip"
              value={activeTrip?.clientId || ''}
              onChange={(e) => selectActiveTrip(e.target.value)}
              disabled={trips.length === 0}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px] max-w-[240px]"
            >
              {trips.length === 0 ? (
                <option value="">No trips created yet</option>
              ) : (
                trips.map((t) => (
                  <option key={t.clientId} value={t.clientId}>
                    {t.title}
                    {t.accessRole === 'view'
                      ? ' (Shared · View)'
                      : t.accessRole === 'edit'
                      ? ' (Shared · Edit)'
                      : ''}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => {
                setEditingTrip(null);
                setTripModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-3.5 h-3.5 text-teal-700" />
              New Trip
            </button>

            {activeTrip && isActiveTripOwner && (
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
              >
                <Share2 className="w-3.5 h-3.5 text-teal-700" />
                Share
              </button>
            )}

            {activeTrip && canEditActiveTrip && (
              <button
                type="button"
                onClick={() => {
                  setEditingTrip(activeTrip);
                  setTripModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                Edit Trip
              </button>
            )}

            {activeTrip && isActiveTripOwner && (
              <button
                type="button"
                onClick={() => handleDeleteTrip(activeTrip)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 min-h-[40px] min-w-[40px]"
                aria-label="Delete active trip"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setCsvModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
              Import CSV
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={toggleWifiOnly}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-medium transition-colors whitespace-nowrap min-h-[40px] ${
                wifiOnlySync
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
              title="Only synchronize journal entries, photos, and PDFs over Wi-Fi"
            >
              {network.isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-teal-700" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-700" />
              )}
              {wifiOnlySync ? 'Wi-Fi Only Sync: On' : 'Wi-Fi Only Sync: Off'}
            </button>

            <button
              type="button"
              onClick={() => triggerSync()}
              disabled={isSyncing || !network.isOnline}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap min-h-[40px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing
                ? 'Syncing...'
                : pendingCount > 0
                ? `Sync (${pendingCount})`
                : 'Sync Now'}
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
              title={session.user.email}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>

        {(syncNotice || activeTrip || session.user) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
            <div className="flex items-center gap-2 flex-wrap">
              <span>{session.user.name || session.user.email}</span>
              <span aria-hidden="true">·</span>
              {activeTrip ? (
                <>
                  <span>{activeTrip.destination || 'Trip'}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activeTrip.startDate} – {activeTrip.endDate}
                  </span>
                  {activeTripRole !== 'owner' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-teal-800 font-medium">
                        Shared by {activeTrip.ownerName || activeTrip.ownerEmail || 'Owner'} ·{' '}
                        {activeTripRole === 'edit' ? 'Can edit' : 'View only'}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{network.connectionType}</span>
                  {lastSyncAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Last synced {new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span>{network.connectionType}</span>
              )}
            </div>
            {syncNotice && <span className="text-amber-700 font-medium">{syncNotice}</span>}
          </div>
        )}
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {view === 'agenda' && (
          <AgendaView
            trip={activeTrip}
            events={activeTripEvents}
            photosByEvent={photosByEvent}
            pdfsByEvent={pdfsByEvent}
            canEdit={canEditActiveTrip}
            onSelectEvent={openExistingEvent}
            onOpenPhoto={(list, index, title) =>
              setLightboxState({ photos: list, initialIndex: index, title })
            }
            onAddStop={(date) => openNewStop(date)}
            onOpenCsvImport={() => setCsvModalOpen(true)}
          />
        )}

        {view === 'calendar' && (
          <CalendarView
            trip={activeTrip}
            events={activeTripEvents}
            canEdit={canEditActiveTrip}
            onSelectEvent={openExistingEvent}
            onAddStop={(date) => openNewStop(date)}
          />
        )}

        {view === 'map' && (
          <CartoMapView
            trip={activeTrip}
            events={activeTripEvents}
            photosByEvent={photosByEvent}
            canEdit={canEditActiveTrip}
            onSelectEvent={openExistingEvent}
            onAssignCoordinates={handleAssignCoordinates}
            onAddStopAtCoords={(lat, lng) => openNewStop(activeTrip?.startDate, { lat, lng })}
          />
        )}

        {view === 'search' && (
          <SearchView
            trips={trips}
            events={events}
            pdfs={pdfs}
            onSelectEvent={openExistingEvent}
          />
        )}

        {view === 'admin' && isAdmin && (
          <AdminUsersView
            token={session.token}
            currentUser={session.user}
            onUnauthorized={handleSignOut}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav
        aria-label="Primary mobile navigation"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid items-center ${
          isAdmin ? 'grid-cols-5' : 'grid-cols-4'
        }`}
      >
        {(
          [
            ['agenda', 'Agenda', ListTodo],
            ['calendar', 'Calendar', CalendarIcon],
            ['map', 'Map', MapIcon],
            ['search', 'Search', SearchIcon],
            ...(isAdmin ? ([['admin', 'Admin', Users]] as const) : []),
          ] as const
        ).map(([key, label, Icon]) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-teal-700' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals & Drawers */}
      <TripModal
        open={tripModalOpen}
        initialTrip={editingTrip}
        onClose={() => setTripModalOpen(false)}
        onSave={handleSaveTrip}
      />

      <TripShareModal
        open={shareModalOpen}
        trip={activeTrip}
        token={session.token}
        onUnauthorized={handleSignOut}
        onClose={() => setShareModalOpen(false)}
      />

      <CsvImportModal
        open={csvModalOpen}
        trips={trips}
        activeTripClientId={activeTrip?.clientId || null}
        onClose={() => setCsvModalOpen(false)}
        onImport={handleCsvImport}
      />

      <EventDetailDrawer
        open={drawerOpen}
        event={selectedEvent}
        defaultDate={drawerDefaultDate}
        defaultCoords={drawerDefaultCoords}
        photos={activeDrawerPhotos}
        pdfs={activeDrawerPdfs}
        readOnly={drawerReadOnly}
        ownerLabel={drawerOwnerLabel}
        onClose={() => setDrawerOpen(false)}
        onSaveEvent={handleSaveEvent}
        onDeleteEvent={handleDeleteEvent}
        onAddPhotos={handleAddPhotos}
        onDeletePhoto={handleDeletePhoto}
        onAddPdfs={handleAddPdfs}
        onDeletePdf={handleDeletePdf}
        onOpenPhoto={(list, index, title) =>
          setLightboxState({ photos: list, initialIndex: index, title })
        }
      />

      {lightboxState && (
        <PhotoLightbox
          photos={lightboxState.photos}
          initialIndex={lightboxState.initialIndex}
          title={lightboxState.title}
          authToken={session.token}
          onClose={() => setLightboxState(null)}
          onCacheFullPhoto={handleCacheFullPhoto}
        />
      )}
    </div>
  );
}
