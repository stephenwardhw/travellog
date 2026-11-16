import React, { useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  Plus,
} from 'lucide-react';
import { ensureDisplayHtml, sanitizeHtml } from '../lib/htmlSanitizer';
import type {
  BookingRecord,
  EventRecord,
  PdfRecord,
  PhotoRecord,
  TripRecord,
} from '../types/journal';

interface AgendaViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  bookings?: BookingRecord[];
  photosByEvent: Map<string, PhotoRecord[]>;
  pdfsByEvent: Map<string, PdfRecord[]>;
  pdfsByBooking?: Map<string, PdfRecord[]>;
  canEdit: boolean;
  onSelectEvent: (event: EventRecord) => void;
  onSelectBooking?: (booking: BookingRecord) => void;
  onOpenPhoto: (photos: PhotoRecord[], index: number, title?: string) => void;
  onAddStop: (defaultDate?: string) => void;
  onAddBooking?: (defaultDate?: string) => void;
  onOpenCsvImport: () => void;
}

const LocalThumb: React.FC<{
  photo: PhotoRecord;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ photo, onClick }) => {
  const [url, setUrl] = useState<string | null>(null);
  const sourceBlob = photo.thumbBlob || photo.blob;

  useEffect(() => {
    if (!sourceBlob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(sourceBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceBlob]);

  if (!url) {
    return (
      <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View full photo ${photo.filename}`}
      className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-zoom-in hover:ring-2 hover:ring-teal-700/40 transition-all"
    >
      <img
        src={url}
        alt={photo.caption || photo.filename}
        className="w-full h-full object-cover"
      />
    </button>
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
  bookings = [],
  photosByEvent,
  pdfsByEvent,
  pdfsByBooking = new Map<string, PdfRecord[]>(),
  canEdit,
  onSelectEvent,
  onSelectBooking,
  onOpenPhoto,
  onAddStop,
  onAddBooking,
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

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate)),
    [bookings]
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

          {canEdit && onAddBooking && (
            <button
              type="button"
              onClick={() => onAddBooking(trip.startDate)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <BedDouble className="w-3.5 h-3.5" />
              Add Stay
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => onAddStop(trip.startDate)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Add Stop
            </button>
          )}
        </div>
      </div>

      {sortedBookings.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <BedDouble className="w-4 h-4 text-indigo-700" />
              Accommodations &amp; Stays ({sortedBookings.length})
            </h3>
            {canEdit && onAddBooking && (
              <button
                type="button"
                onClick={() => onAddBooking(trip.startDate)}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-800 whitespace-nowrap"
              >
                + Add Stay
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedBookings.map((bk) => {
              const isConfirmed = bk.status === 'confirmed';
              const bkPdfs = pdfsByBooking.get(bk.clientId) || [];
              return (
                <button
                  key={bk.clientId}
                  type="button"
                  onClick={() => onSelectBooking?.(bk)}
                  className={`text-left rounded-xl border p-4 transition-colors space-y-1.5 ${
                    isConfirmed
                      ? 'border-indigo-200 bg-white hover:bg-indigo-50/40'
                      : 'border-amber-200 border-dashed bg-amber-50/30 hover:bg-amber-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                    <span className="font-medium text-slate-600">
                      {bk.checkInDate} – {bk.checkOutDate}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                        isConfirmed ? 'text-indigo-700' : 'text-amber-700'
                      }`}
                    >
                      {isConfirmed ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {isConfirmed ? 'Confirmed' : 'Unconfirmed'}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 truncate">{bk.name}</h4>
                  {(bk.confirmationCode || bk.address || bkPdfs.length > 0) && (
                    <p className="text-xs text-slate-500 truncate tabular-nums">
                      {[
                        bk.confirmationCode ? `#${bk.confirmationCode}` : '',
                        bk.address,
                        bkPdfs.length > 0
                          ? `${bkPdfs.length} ${bkPdfs.length === 1 ? 'PDF' : 'PDFs'}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h3 className="font-display text-lg font-semibold text-slate-900">
            No stops planned for {trip.title}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
            {canEdit
              ? 'Add your first stop manually or import a CSV itinerary with dates, locations, and coordinates.'
              : 'This shared trip does not have any itinerary stops yet.'}
          </p>
          {canEdit && (
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
          )}
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
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onAddStop(dateStr)}
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                    >
                      + Add on this day
                    </button>
                  )}
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
                      <div
                        key={ev.clientId}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectEvent(ev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectEvent(ev);
                          }
                        }}
                        className="w-full text-left p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-4 min-h-[64px] cursor-pointer"
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

                          {ev.journalEntry ? (
                            <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                              {ev.journalEntry}
                            </p>
                          ) : ev.details.trim() ? (
                            <div
                              className="text-sm text-slate-600 line-clamp-2 leading-relaxed [&_p]:inline [&_p+p]:ml-1.5 [&_ul]:inline [&_ol]:inline [&_li]:inline [&_li+li]:before:content-['·_'] [&_a]:text-teal-700 [&_a]:underline"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(ensureDisplayHtml(ev.details)),
                              }}
                            />
                          ) : null}

                          {evPhotos.length > 0 && (
                            <div className="flex items-center gap-2 pt-1.5">
                              {evPhotos.slice(0, 4).map((photo, idx) => (
                                <LocalThumb
                                  key={photo.clientId}
                                  photo={photo}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenPhoto(evPhotos, idx, ev.location);
                                  }}
                                />
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
                      </div>
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
