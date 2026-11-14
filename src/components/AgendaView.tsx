import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronRight, FileText, Image as ImageIcon, MapPin, Plus } from 'lucide-react';
import type { EventRecord, PdfRecord, PhotoRecord, TripRecord } from '../types/journal';

interface AgendaViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  photosByEvent: Map<string, PhotoRecord[]>;
  pdfsByEvent: Map<string, PdfRecord[]>;
  onSelectEvent: (event: EventRecord) => void;
  onAddStop: (defaultDate?: string) => void;
  onOpenCsvImport: () => void;
}

const LocalThumb: React.FC<{ photo: PhotoRecord }> = ({ photo }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo.blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.blob]);

  if (!url) {
    return (
      <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={photo.caption || photo.filename}
      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
    />
  );
};

function formatHeadingDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  trip,
  events,
  photosByEvent,
  pdfsByEvent,
  onSelectEvent,
  onAddStop,
  onOpenCsvImport,
}) => {
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'journaled'>('upcoming');
  const todayIso = new Date().toISOString().slice(0, 10);

  const sortedEvents = useMemo(() => {
    const copy = [...events].sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.eventTime || '').localeCompare(b.eventTime || '');
    });
    if (filter === 'upcoming') {
      const upcoming = copy.filter((e) => e.eventDate >= todayIso);
      return upcoming.length > 0 ? upcoming : copy;
    }
    if (filter === 'journaled') {
      return copy.filter(
        (e) =>
          e.journalEntry.trim().length > 0 ||
          (photosByEvent.get(e.clientId)?.length || 0) > 0 ||
          (pdfsByEvent.get(e.clientId)?.length || 0) > 0
      );
    }
    return copy;
  }, [events, filter, todayIso, photosByEvent, pdfsByEvent]);

  const upcomingCount = useMemo(
    () => events.filter((e) => e.eventDate >= todayIso).length,
    [events, todayIso]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (const ev of sortedEvents) {
      const list = map.get(ev.eventDate) || [];
      list.push(ev);
      map.set(ev.eventDate, list);
    }
    return Array.from(map.entries());
  }, [sortedEvents]);

  if (!trip) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center max-w-xl mx-auto mt-8">
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Start your first trip
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Create a trip or import an itinerary CSV to map stops, write daily journals, and attach
          offline photos and PDFs.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onAddStop()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            New Trip & Stop
          </button>
          <button
            type="button"
            onClick={onOpenCsvImport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Import CSV Itinerary
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Agenda
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {events.length} total stops · {upcomingCount} upcoming
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Stops
            </button>
            <button
              type="button"
              onClick={() => setFilter('journaled')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === 'journaled'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              With Journal
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAddStop(trip.startDate)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Add Stop
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h3 className="font-display text-lg font-semibold text-slate-900">
            No stops planned for {trip.title}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
            Add your first stop manually or import a CSV itinerary with dates, locations, and
            coordinates.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onAddStop(trip.startDate)}
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 min-h-[44px]"
            >
              Add First Stop
            </button>
            <button
              type="button"
              onClick={onOpenCsvImport}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
            >
              Import CSV
            </button>
          </div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No stops match this filter yet.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dateStr, dayEvents]) => {
            const isPast = dateStr < todayIso;
            return (
              <section key={dateStr} className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 tabular-nums">
                    {formatHeadingDate(dateStr)}
                    {dateStr === todayIso && (
                      <span className="ml-2 text-xs font-medium text-teal-700">· Today</span>
                    )}
                    {isPast && (
                      <span className="ml-2 text-xs font-normal text-slate-400">· Past</span>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onAddStop(dateStr)}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                  >
                    + Add on this day
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                  {dayEvents.map((ev) => {
                    const evPhotos = photosByEvent.get(ev.clientId) || [];
                    const evPdfs = pdfsByEvent.get(ev.clientId) || [];
                    const hasPending =
                      ev.syncStatus === 'pending' ||
                      evPhotos.some((p) => p.syncStatus === 'pending') ||
                      evPdfs.some((p) => p.syncStatus === 'pending');

                    return (
                      <button
                        key={ev.clientId}
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        className="w-full text-left p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-4 min-h-[64px]"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums flex-wrap">
                            <span>{ev.eventTime || 'All day'}</span>
                            {ev.latitude !== null && ev.longitude !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                  <MapPin className="w-3 h-3 text-teal-700" />
                                  {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}
                                </span>
                              </>
                            )}
                            {evPhotos.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3 text-slate-400" />
                                  {evPhotos.length} {evPhotos.length === 1 ? 'photo' : 'photos'}
                                </span>
                              </>
                            )}
                            {evPdfs.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-slate-400" />
                                  {evPdfs.length} {evPdfs.length === 1 ? 'PDF' : 'PDFs'}
                                </span>
                              </>
                            )}
                            {hasPending && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 font-medium">
                                  Queued for Wi-Fi sync
                                </span>
                              </>
                            )}
                          </div>

                          <h4 className="text-base font-semibold text-slate-900 truncate">
                            {ev.location}
                          </h4>

                          {(ev.journalEntry || ev.details) && (
                            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                              {ev.journalEntry || ev.details}
                            </p>
                          )}

                          {evPhotos.length > 0 && (
                            <div className="flex items-center gap-2 pt-1.5">
                              {evPhotos.slice(0, 4).map((photo) => (
                                <LocalThumb key={photo.clientId} photo={photo} />
                              ))}
                              {evPhotos.length > 4 && (
                                <span className="text-xs font-medium text-slate-500 pl-1 tabular-nums">
                                  +{evPhotos.length - 4} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 mt-1" />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
