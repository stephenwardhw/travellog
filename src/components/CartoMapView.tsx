import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { BedDouble, Crosshair, Flag, MapPin, Plus, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import { htmlToPlainText } from '../lib/htmlSanitizer';
import type { BookingRecord, EventRecord, PhotoRecord, TripRecord } from '../types/journal';

interface CartoMapViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  bookings?: BookingRecord[];
  photosByEvent: Map<string, PhotoRecord[]>;
  canEdit: boolean;
  onSelectEvent: (event: EventRecord) => void;
  onSelectBooking?: (booking: BookingRecord) => void;
  onEditTrip?: () => void;
  onAssignCoordinates: (event: EventRecord, lat: number, lng: number) => Promise<void>;
  onAssignBookingCoordinates?: (booking: BookingRecord, lat: number, lng: number) => Promise<void>;
  onAddStopAtCoords: (lat: number, lng: number) => void;
}

const CARTO_VOYAGER_URL = '/api/tiles/{s}/{z}/{x}/{y}{r}.png';

export const CartoMapView: React.FC<CartoMapViewProps> = ({
  trip,
  events,
  bookings = [],
  photosByEvent,
  canEdit,
  onSelectEvent,
  onSelectBooking,
  onEditTrip,
  onAssignCoordinates,
  onAssignBookingCoordinates,
  onAddStopAtCoords,
}) => {
  const { isOnline } = useNetworkStatus();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [pinningEvent, setPinningEvent] = useState<EventRecord | null>(null);
  const [pinningBooking, setPinningBooking] = useState<BookingRecord | null>(null);
  const [addMode, setAddMode] = useState(false);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const d = a.eventDate.localeCompare(b.eventDate);
        if (d !== 0) return d;
        return (a.eventTime || '').localeCompare(b.eventTime || '');
      }),
    [events]
  );

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate)),
    [bookings]
  );

  const mappedEvents = useMemo(
    () => sortedEvents.filter((e) => e.latitude !== null && e.longitude !== null),
    [sortedEvents]
  );

  const mappedBookings = useMemo(
    () => sortedBookings.filter((b) => b.latitude !== null && b.longitude !== null),
    [sortedBookings]
  );

  const hasStartCoords =
    trip?.startLatitude !== null &&
    trip?.startLatitude !== undefined &&
    trip?.startLongitude !== null &&
    trip?.startLongitude !== undefined;

  const hasEndCoords =
    trip?.endLatitude !== null &&
    trip?.endLatitude !== undefined &&
    trip?.endLongitude !== null &&
    trip?.endLongitude !== undefined;

  const unmappedCount = useMemo(
    () =>
      sortedEvents.filter((e) => e.latitude === null || e.longitude === null).length +
      sortedBookings.filter((b) => b.latitude === null || b.longitude === null).length,
    [sortedEvents, sortedBookings]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [35.0, 135.7],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer(CARTO_VOYAGER_URL, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Handle map click for pinning unmapped stops/bookings or adding a new stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      if (!canEdit) return;
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));
      if (pinningEvent) {
        const target = pinningEvent;
        setPinningEvent(null);
        await onAssignCoordinates(target, lat, lng);
      } else if (pinningBooking && onAssignBookingCoordinates) {
        const target = pinningBooking;
        setPinningBooking(null);
        await onAssignBookingCoordinates(target, lat, lng);
      } else if (addMode) {
        setAddMode(false);
        onAddStopAtCoords(lat, lng);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [
    canEdit,
    pinningEvent,
    pinningBooking,
    addMode,
    onAssignCoordinates,
    onAssignBookingCoordinates,
    onAddStopAtCoords,
  ]);

  // Render start/end anchors, event stop markers, booking pins, and route polyline
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const routeCoords: L.LatLngExpression[] = [];
    const allBoundsCoords: L.LatLngExpression[] = [];

    if (trip && hasStartCoords) {
      const sLat = trip.startLatitude!;
      const sLng = trip.startLongitude!;
      routeCoords.push([sLat, sLng]);
      allBoundsCoords.push([sLat, sLng]);

      const startIcon = L.divIcon({
        className: '',
        html: `<div style="padding:0 8px;height:26px;border-radius:8px;background:#047857;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:0.05em;">START</div>`,
        iconSize: [54, 26],
        iconAnchor: [27, 13],
        popupAnchor: [0, -13],
      });

      const startMarker = L.marker([sLat, sLng], { icon: startIcon });
      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1 min-w-[180px]';
      const metaEl = document.createElement('div');
      metaEl.className = 'text-[11px] font-semibold text-emerald-700';
      metaEl.textContent = `Trip Start · ${trip.startDate}`;
      const titleEl = document.createElement('div');
      titleEl.className = 'text-sm font-semibold text-slate-900';
      titleEl.textContent = trip.startLocationName || 'Starting Location';
      popupRoot.appendChild(metaEl);
      popupRoot.appendChild(titleEl);
      startMarker.bindPopup(popupRoot);
      startMarker.addTo(group);
    }

    mappedEvents.forEach((ev, idx) => {
      const lat = ev.latitude!;
      const lng = ev.longitude!;
      routeCoords.push([lat, lng]);
      allBoundsCoords.push([lat, lng]);

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#0F766E;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:Plus Jakarta Sans,sans-serif;">${
          idx + 1
        }</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const marker = L.marker([lat, lng], { icon });
      const photoCount = photosByEvent.get(ev.clientId)?.length || 0;
      const plainDetails = htmlToPlainText(ev.details);

      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1.5 min-w-[190px]';

      const metaEl = document.createElement('div');
      metaEl.className = 'text-[11px] text-slate-500';
      metaEl.textContent = `${ev.eventDate}${ev.eventTime ? ` · ${ev.eventTime}` : ''}${
        photoCount > 0 ? ` · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''
      }`;

      const titleEl = document.createElement('div');
      titleEl.className = 'text-sm font-semibold text-slate-900';
      titleEl.textContent = ev.location;

      popupRoot.appendChild(metaEl);
      popupRoot.appendChild(titleEl);

      if (ev.address) {
        const addrEl = document.createElement('div');
        addrEl.className = 'text-[11px] text-slate-500';
        addrEl.textContent = ev.address;
        popupRoot.appendChild(addrEl);
      }

      const descEl = document.createElement('div');
      descEl.className = 'text-xs text-slate-600 line-clamp-2';
      descEl.textContent =
        htmlToPlainText(ev.journalEntry) || plainDetails || 'No notes yet.';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'mt-1.5 w-full rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer';
      btn.textContent = 'Open Journal';
      btn.onclick = () => onSelectEvent(ev);

      popupRoot.appendChild(descEl);
      popupRoot.appendChild(btn);

      marker.bindPopup(popupRoot);
      marker.addTo(group);
    });

    if (trip && hasEndCoords) {
      const eLat = trip.endLatitude!;
      const eLng = trip.endLongitude!;
      routeCoords.push([eLat, eLng]);
      allBoundsCoords.push([eLat, eLng]);

      const endIcon = L.divIcon({
        className: '',
        html: `<div style="padding:0 8px;height:26px;border-radius:8px;background:#B91C1C;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:0.05em;">END</div>`,
        iconSize: [48, 26],
        iconAnchor: [24, 13],
        popupAnchor: [0, -13],
      });

      const endMarker = L.marker([eLat, eLng], { icon: endIcon });
      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1 min-w-[180px]';
      const metaEl = document.createElement('div');
      metaEl.className = 'text-[11px] font-semibold text-red-700';
      metaEl.textContent = `Trip End · ${trip.endDate}`;
      const titleEl = document.createElement('div');
      titleEl.className = 'text-sm font-semibold text-slate-900';
      titleEl.textContent = trip.endLocationName || 'Ending Location';
      popupRoot.appendChild(metaEl);
      popupRoot.appendChild(titleEl);
      endMarker.bindPopup(popupRoot);
      endMarker.addTo(group);
    }

    if (routeCoords.length > 1) {
      L.polyline(routeCoords, {
        color: '#0F766E',
        weight: 2.5,
        opacity: 0.75,
        dashArray: '6 6',
      }).addTo(group);
    }

    mappedBookings.forEach((bk) => {
      const lat = bk.latitude!;
      const lng = bk.longitude!;
      allBoundsCoords.push([lat, lng]);

      const isConfirmed = bk.status === 'confirmed';
      const pinBg = isConfirmed ? '#4338CA' : '#D97706';

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:8px;background:${pinBg};color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;" title="${bk.name.replace(
          /"/g,
          '&quot;'
        )}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      });

      const marker = L.marker([lat, lng], { icon });

      const popupRoot = document.createElement('div');
      popupRoot.className = 'space-y-1.5 min-w-[200px]';

      const metaEl = document.createElement('div');
      metaEl.className = 'text-[11px] font-medium';
      metaEl.style.color = isConfirmed ? '#4338CA' : '#B45309';
      metaEl.textContent = `${isConfirmed ? 'Confirmed stay' : 'Unconfirmed stay'} · ${
        bk.checkInDate
      } – ${bk.checkOutDate}`;

      const titleEl = document.createElement('div');
      titleEl.className = 'text-sm font-semibold text-slate-900';
      titleEl.textContent = bk.name;

      const subEl = document.createElement('div');
      subEl.className = 'text-xs text-slate-600 line-clamp-2';
      subEl.textContent =
        [
          bk.confirmationCode ? `Ref #${bk.confirmationCode}` : '',
          bk.address,
          htmlToPlainText(bk.notes),
        ]
          .filter(Boolean)
          .join(' · ') || 'No booking notes yet.';

      popupRoot.appendChild(metaEl);
      popupRoot.appendChild(titleEl);
      popupRoot.appendChild(subEl);

      if (onSelectBooking) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'mt-1.5 w-full rounded-md bg-indigo-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 cursor-pointer';
        btn.textContent = 'Open Booking';
        btn.onclick = () => onSelectBooking(bk);
        popupRoot.appendChild(btn);
      }

      marker.bindPopup(popupRoot);
      marker.addTo(group);
    });

    if (allBoundsCoords.length > 0) {
      const bounds = L.latLngBounds(allBoundsCoords);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    }
  }, [
    trip?.startLatitude,
    trip?.startLongitude,
    trip?.startLocationName,
    trip?.startDate,
    trip?.endLatitude,
    trip?.endLongitude,
    trip?.endLocationName,
    trip?.endDate,
    hasStartCoords,
    hasEndCoords,
    mappedEvents,
    mappedBookings,
    photosByEvent,
    onSelectEvent,
    onSelectBooking,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            CARTO Route Map
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {trip ? `${trip.title} · ` : ''}
            {mappedEvents.length} mapped stops · {mappedBookings.length} mapped stays ·{' '}
            {unmappedCount} unmapped
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {pinningEvent ? (
              <button
                type="button"
                onClick={() => setPinningEvent(null)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 min-h-[40px]"
              >
                Click map to pin &ldquo;{pinningEvent.location}&rdquo; · Cancel
              </button>
            ) : pinningBooking ? (
              <button
                type="button"
                onClick={() => setPinningBooking(null)}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-900 min-h-[40px]"
              >
                Click map to pin stay &ldquo;{pinningBooking.name}&rdquo; · Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAddMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                  addMode
                    ? 'bg-amber-600 text-white'
                    : 'bg-teal-700 text-white hover:bg-teal-800'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {addMode ? 'Tap map to place new stop...' : 'Drop Pin for New Stop'}
              </button>
            )}
          </div>
        )}
      </div>

      {!isOnline && (
        <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs text-slate-700 flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Offline mode — previously viewed CARTO map tiles load from cache; markers and route lines
            remain interactive.
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-9 rounded-2xl border border-slate-200 bg-white overflow-hidden relative">
          <div
            ref={mapContainerRef}
            className="w-full h-[420px] lg:h-[580px] z-0"
          />
        </div>

        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-5 max-h-[580px] overflow-y-auto">
          {trip && (
            <div className="space-y-2.5 pb-4 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-emerald-700" />
                  Route Anchors
                </h3>
                {canEdit && onEditTrip && (
                  <button
                    type="button"
                    onClick={onEditTrip}
                    className="text-xs font-medium text-teal-700 hover:underline shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-emerald-800 uppercase tracking-wide text-[10px]">
                      Start
                    </span>
                    {hasStartCoords ? (
                      <button
                        type="button"
                        onClick={() =>
                          mapRef.current?.setView([trip.startLatitude!, trip.startLongitude!], 12, {
                            animate: true,
                          })
                        }
                        className="text-[11px] font-medium text-teal-700 hover:underline"
                      >
                        Focus
                      </button>
                    ) : (
                      canEdit &&
                      onEditTrip && (
                        <button
                          type="button"
                          onClick={onEditTrip}
                          className="text-[11px] font-medium text-amber-700 hover:underline"
                        >
                          Set in Edit Trip
                        </button>
                      )
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {trip.startLocationName || 'Not set'}
                  </p>
                  {hasStartCoords && (
                    <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {trip.startLatitude!.toFixed(4)}, {trip.startLongitude!.toFixed(4)}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-red-700 uppercase tracking-wide text-[10px]">
                      End
                    </span>
                    {hasEndCoords ? (
                      <button
                        type="button"
                        onClick={() =>
                          mapRef.current?.setView([trip.endLatitude!, trip.endLongitude!], 12, {
                            animate: true,
                          })
                        }
                        className="text-[11px] font-medium text-teal-700 hover:underline"
                      >
                        Focus
                      </button>
                    ) : (
                      canEdit &&
                      onEditTrip && (
                        <button
                          type="button"
                          onClick={onEditTrip}
                          className="text-[11px] font-medium text-amber-700 hover:underline"
                        >
                          Set in Edit Trip
                        </button>
                      )
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {trip.endLocationName || 'Not set'}
                  </p>
                  {hasEndCoords && (
                    <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {trip.endLatitude!.toFixed(4)}, {trip.endLongitude!.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {sortedBookings.length > 0 && (
            <div className="space-y-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <BedDouble className="w-4 h-4 text-indigo-700" />
                  Stays &amp; Bookings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Accommodations marked by status.
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {sortedBookings.map((bk) => {
                  const hasCoords = bk.latitude !== null && bk.longitude !== null;
                  const isConfirmed = bk.status === 'confirmed';
                  return (
                    <div key={bk.clientId} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasCoords && mapRef.current) {
                              mapRef.current.setView([bk.latitude!, bk.longitude!], 14, {
                                animate: true,
                              });
                            } else {
                              onSelectBooking?.(bk);
                            }
                          }}
                          className="text-left group flex-1 min-w-0"
                        >
                          <p
                            className={`text-[11px] font-medium tabular-nums ${
                              isConfirmed ? 'text-indigo-700' : 'text-amber-700'
                            }`}
                          >
                            {isConfirmed ? 'Confirmed' : 'Unconfirmed'} · {bk.checkInDate}
                          </p>
                          <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-800 truncate">
                            {bk.name}
                          </p>
                        </button>
                        {onSelectBooking && (
                          <button
                            type="button"
                            onClick={() => onSelectBooking(bk)}
                            className="text-xs font-medium text-indigo-700 hover:underline shrink-0"
                          >
                            {canEdit ? 'Edit' : 'View'}
                          </button>
                        )}
                      </div>

                      {hasCoords ? (
                        <p className="text-[11px] font-mono text-slate-400 tabular-nums flex items-center gap-1">
                          <BedDouble className="w-3 h-3 text-indigo-700" />
                          {bk.latitude!.toFixed(4)}, {bk.longitude!.toFixed(4)}
                        </p>
                      ) : canEdit && onAssignBookingCoordinates ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPinningEvent(null);
                            setAddMode(false);
                            setPinningBooking(bk);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          Pin coordinates on map
                        </button>
                      ) : (
                        <p className="text-[11px] text-slate-400">No coordinates pinned</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Itinerary Stops</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select a stop to focus or pin missing coordinates.
              </p>
            </div>

            {sortedEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No stops yet. Use &ldquo;Drop Pin for New Stop&rdquo; or import a CSV itinerary.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedEvents.map((ev) => {
                  const hasCoords = ev.latitude !== null && ev.longitude !== null;
                  const mappedIdx = mappedEvents.findIndex((m) => m.clientId === ev.clientId);
                  return (
                    <div key={ev.clientId} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasCoords && mapRef.current) {
                              mapRef.current.setView([ev.latitude!, ev.longitude!], 13, {
                                animate: true,
                              });
                            } else {
                              onSelectEvent(ev);
                            }
                          }}
                          className="text-left group flex-1 min-w-0"
                        >
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {hasCoords ? `#${mappedIdx + 1} · ` : ''}
                            {ev.eventDate}
                          </p>
                          <p className="text-sm font-medium text-slate-900 group-hover:text-teal-800 truncate">
                            {ev.location}
                          </p>
                          {ev.address && (
                            <p className="text-[11px] text-slate-500 truncate">{ev.address}</p>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectEvent(ev)}
                          className="text-xs font-medium text-teal-700 hover:underline shrink-0"
                        >
                          {canEdit ? 'Edit' : 'View'}
                        </button>
                      </div>

                      {hasCoords ? (
                        <p className="text-[11px] font-mono text-slate-400 tabular-nums flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-teal-700" />
                          {ev.latitude!.toFixed(4)}, {ev.longitude!.toFixed(4)}
                        </p>
                      ) : canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPinningBooking(null);
                            setAddMode(false);
                            setPinningEvent(ev);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          Pin coordinates on map
                        </button>
                      ) : (
                        <p className="text-[11px] text-slate-400">No coordinates pinned</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
