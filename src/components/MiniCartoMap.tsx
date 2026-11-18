import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import type { BookingStatus } from '../types/journal';

interface MiniCartoMapProps {
  latitude: number | null;
  longitude: number | null;
  title?: string;
  pinVariant?: 'stay' | 'event' | 'start' | 'end';
  status?: BookingStatus;
  interactive?: boolean;
  allowEmptyMap?: boolean;
  defaultCenter?: { lat: number; lng: number } | null;
  onChangeCoordinates?: (lat: number, lng: number) => void;
}

const CARTO_VOYAGER_URL = '/api/tiles/{s}/{z}/{x}/{y}{r}.png';

function buildNavigationHref(lat: number, lng: number, label?: string): {
  href: string;
  isNativeScheme: boolean;
} {
  const cleanLabel = (label || 'Destination').trim();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

  if (/android/i.test(ua)) {
    return {
      href: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(cleanLabel)})`,
      isNativeScheme: true,
    };
  }

  if (/iphone|ipad|ipod|macintosh/i.test(ua)) {
    return {
      href: `maps://?daddr=${lat},${lng}&q=${encodeURIComponent(cleanLabel)}`,
      isNativeScheme: true,
    };
  }

  return {
    href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    isNativeScheme: false,
  };
}

export const MiniCartoMap: React.FC<MiniCartoMapProps> = ({
  latitude,
  longitude,
  title = 'Location',
  pinVariant = 'stay',
  status = 'unconfirmed',
  interactive = false,
  allowEmptyMap = false,
  defaultCenter = null,
  onChangeCoordinates,
}) => {
  const { isOnline } = useNetworkStatus();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChangeCoordinates);
  onChangeRef.current = onChangeCoordinates;

  const hasValidCoords =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const shouldRenderMap = hasValidCoords || allowEmptyMap;

  const navLink = useMemo(() => {
    if (!hasValidCoords) return null;
    return buildNavigationHref(latitude!, longitude!, title);
  }, [hasValidCoords, latitude, longitude, title]);

  useEffect(() => {
    if (!shouldRenderMap || !containerRef.current) return;
    if (mapRef.current) return;

    const initialLat = hasValidCoords
      ? latitude!
      : defaultCenter?.lat ?? 35.0;
    const initialLng = hasValidCoords
      ? longitude!
      : defaultCenter?.lng ?? 135.7;
    const initialZoom = hasValidCoords ? 15 : defaultCenter ? 12 : 3;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(CARTO_VOYAGER_URL, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [shouldRenderMap]);

  // Handle interactive map click to move or drop pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      const nextLat = Number(e.latlng.lat.toFixed(5));
      const nextLng = Number(e.latlng.lng.toFixed(5));
      onChangeRef.current?.(nextLat, nextLng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [interactive, shouldRenderMap]);

  // Update marker position and zoom when coordinates, variant, or status change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasValidCoords) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngExpression = [latitude!, longitude!];
    const safeTitle = (title || 'Location').replace(/"/g, '&quot;');

    const iconHtml =
      pinVariant === 'start'
        ? `<div style="padding:0 7px;height:28px;border-radius:8px;background:#047857;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:0.04em;" title="${safeTitle}">START</div>`
        : pinVariant === 'end'
        ? `<div style="padding:0 7px;height:28px;border-radius:8px;background:#B91C1C;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;letter-spacing:0.04em;" title="${safeTitle}">END</div>`
        : pinVariant === 'event'
        ? `<div style="width:30px;height:30px;border-radius:9999px;background:#0F766E;color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;" title="${safeTitle}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`
        : `<div style="width:30px;height:30px;border-radius:8px;background:${
            status === 'confirmed' ? '#4338CA' : '#D97706'
          };color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;" title="${safeTitle}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg></div>`;

    const icon = L.divIcon({
      className: '',
      html: iconHtml,
      iconSize: pinVariant === 'start' || pinVariant === 'end' ? [52, 28] : [30, 30],
      iconAnchor: pinVariant === 'start' || pinVariant === 'end' ? [26, 14] : [15, 15],
    });

    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
      markerRef.current.setIcon(icon);
      if (markerRef.current.dragging) {
        if (interactive) {
          markerRef.current.dragging.enable();
        } else {
          markerRef.current.dragging.disable();
        }
      }
    } else {
      const marker = L.marker(pos, {
        icon,
        draggable: interactive,
      }).addTo(map);

      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        onChangeRef.current?.(Number(ll.lat.toFixed(5)), Number(ll.lng.toFixed(5)));
      });

      markerRef.current = marker;
    }

    const currentZoom = map.getZoom();
    map.setView(pos, currentZoom < 13 ? 15 : currentZoom, { animate: true });
    map.invalidateSize();
  }, [hasValidCoords, latitude, longitude, pinVariant, status, title, interactive]);

  if (!shouldRenderMap) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="relative w-full h-[190px]">
        <div ref={containerRef} className="w-full h-full z-0" />
        {!isOnline && (
          <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-700 shadow-xs">
            <WifiOff className="w-3 h-3 text-slate-500" />
            <span>Offline tiles</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <MapPin
            className={`w-3.5 h-3.5 shrink-0 ${
              pinVariant === 'start'
                ? 'text-emerald-700'
                : pinVariant === 'end'
                ? 'text-red-700'
                : pinVariant === 'event'
                ? 'text-teal-700'
                : 'text-indigo-700'
            }`}
          />
          <span className="truncate">
            {hasValidCoords
              ? interactive
                ? 'Drag pin or click map to adjust coordinates'
                : 'CARTO map preview'
              : 'Click anywhere on the map to drop pin'}
          </span>
          {hasValidCoords && (
            <span className="hidden sm:inline font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
              ({latitude!.toFixed(5)}, {longitude!.toFixed(5)})
            </span>
          )}
        </div>

        {navLink && (
          <a
            href={navLink.href}
            target={navLink.isNativeScheme ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            title={`Open navigation to ${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}`}
          >
            <Navigation className="w-3.5 h-3.5" />
            Navigate To
          </a>
        )}
      </div>
    </div>
  );
};
