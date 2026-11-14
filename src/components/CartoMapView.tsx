import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, MapPin, Plus, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import type { EventRecord, PhotoRecord, TripRecord } from '../types/journal';

interface CartoMapViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  photosByEvent: Map<string, PhotoRecord[]>;
  onSelectEvent: (event: EventRecord) => void;
  onAssignCoordinates: (event: EventRecord, lat: number, lng: number) => Promise<void>;
  onAddStopAtCoords: (lat: number, lng: number) => void;
}

const CARTO_VOYAGER_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export const CartoMapView: React.FC<CartoMapViewProps> = ({
  trip,
  events,
  photosByEvent,
  onSelectEvent,
  onAssignCoordinates,
  onAddStopAtCoords,
}) => {
  const { isOnline } = useNetworkStatus();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [pinningEvent, setPinningEvent] = useState<EventRecord | null>(null);
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

  const mappedEvents = useMemo(
    () => sortedEvents.filter((e) => e.latitude !== null && e.longitude !== null),
    [sortedEvents]
  );

  const unmappedEvents = useMemo(
    () => sortedEvents.filter((e) => e.latitude === null || e.longitude === null),
    [sortedEvents]
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

  // Handle map click for pinning unmapped stops or adding a new stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));
      if (pinningEvent) {
        const target = pinningEvent;
        setPinningEvent(null);
        await onAssignCoordinates(target, lat, lng);
      } else if (addMode) {
        setAddMode(false);
        onAddStopAtCoords(lat, lng);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [pinningEvent, addMode, onAssignCoordinates, onAddStopAtCoords]);

  // Render markers and route polyline
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const coords: L.LatLngExpression[] = [];
    mappedEvents.forEach((ev, idx) => {
      const lat = ev.latitude!;
      const lng = ev.longitude!;
      coords.push([lat, lng]);

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

      const descEl = document.createElement('div');
      descEl.className = 'text-xs text-slate-600 line-clamp-2';
      descEl.textContent = ev.journalEntry || ev.details || 'No notes yet.';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'mt-1.5 w-full rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer';
      btn.textContent = 'Open Journal';
      btn.onclick = () => onSelectEvent(ev);

      popupRoot.appendChild(metaEl);
      popupRoot.appendChild(titleEl);
      popupRoot.appendChild(descEl);
      popupRoot.appendChild(btn);

      marker.bindPopup(popupRoot);
      marker.addTo(group);
    });

    if (coords.length > 1) {
      L.polyline(coords, {
        color: '#0F766E',
        weight: 2.5,
        opacity: 0.75,
        dashArray: '6 6',
      }).addTo(group);
    }

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    }
  }, [mappedEvents, photosByEvent, onSelectEvent]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            CARTO Route Map
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {trip ? `${trip.title} · ` : ''}
            {mappedEvents.length} mapped stops · {unmappedEvents.length} unmapped
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pinningEvent ? (
            <button
              type="button"
              onClick={() => setPinningEvent(null)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 min-h-[40px]"
            >
              Click map to pin &ldquo;{pinningEvent.location}&rdquo; · Cancel
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

        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-4 max-h-[580px] overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Itinerary Stops</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a stop to focus or pin missing coordinates.
            </p>
          </div>

          {sortedEvents.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
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
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        className="text-xs font-medium text-teal-700 hover:underline shrink-0"
                      >
                        Edit
                      </button>
                    </div>

                    {hasCoords ? (
                      <p className="text-[11px] font-mono text-slate-400 tabular-nums flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-700" />
                        {ev.latitude!.toFixed(4)}, {ev.longitude!.toFixed(4)}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPinningEvent(ev)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Pin coordinates on map
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
