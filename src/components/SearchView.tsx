import React, { useMemo, useState } from 'react';
import { BedDouble, FileText, MapPin, Search as SearchIcon } from 'lucide-react';
import { htmlToPlainText } from '../lib/htmlSanitizer';
import type {
  BookingRecord,
  EventRecord,
  PdfRecord,
  SearchMatch,
  TripRecord,
} from '../types/journal';

interface SearchViewProps {
  trips: TripRecord[];
  events: EventRecord[];
  bookings?: BookingRecord[];
  pdfs: PdfRecord[];
  onSelectEvent: (event: EventRecord) => void;
  onSelectBooking?: (booking: BookingRecord) => void;
}

function buildSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 100);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={idx} className="bg-teal-100 text-teal-900 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

export const SearchView: React.FC<SearchViewProps> = ({
  trips,
  events,
  bookings = [],
  pdfs,
  onSelectEvent,
  onSelectBooking,
}) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'events' | 'bookings' | 'pdfs'>('all');

  const tripMap = useMemo(() => {
    const m = new Map<string, TripRecord>();
    trips.forEach((t) => m.set(t.clientId, t));
    return m;
  }, [trips]);

  const eventMap = useMemo(() => {
    const m = new Map<string, EventRecord>();
    events.forEach((e) => m.set(e.clientId, e));
    return m;
  }, [events]);

  const bookingMap = useMemo(() => {
    const m = new Map<string, BookingRecord>();
    bookings.forEach((b) => m.set(b.clientId, b));
    return m;
  }, [bookings]);

  const matches = useMemo<SearchMatch[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchMatch[] = [];

    if (scope === 'all' || scope === 'events') {
      for (const ev of events) {
        const trip = tripMap.get(ev.tripClientId);
        const plainDetails = htmlToPlainText(ev.details);
        const plainJournal = htmlToPlainText(ev.journalEntry);
        if (ev.location.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'location',
            snippet: plainDetails || plainJournal || ev.location,
          });
        } else if (plainJournal.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'journal',
            snippet: buildSnippet(plainJournal, q),
          });
        } else if (plainDetails.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'details',
            snippet: buildSnippet(plainDetails, q),
          });
        }
      }
    }

    if (scope === 'all' || scope === 'bookings') {
      for (const bk of bookings) {
        const trip = tripMap.get(bk.tripClientId);
        const combined = [bk.name, bk.confirmationCode, bk.address, bk.notes, bk.status]
          .filter(Boolean)
          .join(' · ');
        if (combined.toLowerCase().includes(q)) {
          results.push({
            booking: bk,
            trip,
            source: 'booking',
            snippet: buildSnippet(combined, q),
          });
        }
      }
    }

    if (scope === 'all' || scope === 'pdfs') {
      for (const pdf of pdfs) {
        const ev = pdf.eventClientId ? eventMap.get(pdf.eventClientId) : undefined;
        const bk = pdf.bookingClientId ? bookingMap.get(pdf.bookingClientId) : undefined;
        if (!ev && !bk) continue;

        const trip = ev
          ? tripMap.get(ev.tripClientId)
          : bk
          ? tripMap.get(bk.tripClientId)
          : undefined;

        const filenameMatch = pdf.filename.toLowerCase().includes(q);
        const contentMatch = pdf.extractedText.toLowerCase().includes(q);
        if (filenameMatch || contentMatch) {
          results.push({
            event: ev,
            booking: bk,
            trip,
            source: 'pdf',
            pdfFilename: pdf.filename,
            pdfClientId: pdf.clientId,
            snippet: contentMatch
              ? buildSnippet(pdf.extractedText, q)
              : `Matched PDF filename: ${pdf.filename}`,
          });
        }
      }
    }

    return results.sort((a, b) => {
      const aDate = a.event?.eventDate || a.booking?.checkInDate || '';
      const bDate = b.event?.eventDate || b.booking?.checkInDate || '';
      return bDate.localeCompare(aDate);
    });
  }, [query, scope, events, bookings, pdfs, tripMap, eventMap, bookingMap]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Search Journals, Stays &amp; PDFs
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Searches locally cached event notes, locations, journal entries, stays, confirmation
          codes, and full text inside attached PDFs—even while offline.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations, hotels, confirmation codes, journal notes, PDF text..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start flex-wrap">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap ${
              scope === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            All Sources
          </button>
          <button
            type="button"
            onClick={() => setScope('events')}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap ${
              scope === 'events' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Events
          </button>
          <button
            type="button"
            onClick={() => setScope('bookings')}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap ${
              scope === 'bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Stays
          </button>
          <button
            type="button"
            onClick={() => setScope('pdfs')}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap ${
              scope === 'pdfs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            PDFs
          </button>
        </div>
      </div>

      {!query.trim() ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-900 tabular-nums">
            {events.length} stops, {bookings.length} stays, and {pdfs.length} PDF documents indexed
            locally
          </p>
          <p className="text-xs text-slate-500">
            Enter any keyword, confirmation number, property name, street name, or phrase to search
            across all trips.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No matches found for &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            {matches.length} {matches.length === 1 ? 'result' : 'results'}
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {matches.map((m, idx) => {
              const titleText = m.event?.location || m.booking?.name || 'Item';
              const dateText = m.event
                ? m.event.eventDate
                : m.booking
                ? `${m.booking.checkInDate} – ${m.booking.checkOutDate}`
                : '';
              const keyId = m.event?.clientId || m.booking?.clientId || 'item';

              return (
                <button
                  key={`${keyId}-${m.source}-${m.pdfClientId || idx}`}
                  type="button"
                  onClick={() => {
                    if (m.event) {
                      onSelectEvent(m.event);
                    } else if (m.booking && onSelectBooking) {
                      onSelectBooking(m.booking);
                    }
                  }}
                  className="w-full text-left p-4 sm:p-5 hover:bg-slate-50 transition-colors space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap tabular-nums">
                    <span>{m.trip?.title || 'Trip'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{dateText}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-medium inline-flex items-center gap-1 ${
                        m.booking && !m.event ? 'text-indigo-800' : 'text-teal-800'
                      }`}
                    >
                      {m.source === 'pdf' ? (
                        <>
                          <FileText className="w-3 h-3" />
                          PDF: {m.pdfFilename}
                        </>
                      ) : m.source === 'booking' ? (
                        <>
                          <BedDouble className="w-3 h-3" />
                          Stay ({m.booking?.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed'})
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3 h-3" />
                          {m.source === 'journal'
                            ? 'Daily Journal'
                            : m.source === 'details'
                            ? 'Event Details'
                            : 'Location'}
                        </>
                      )}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    <HighlightedText text={titleText} query={query} />
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <HighlightedText text={m.snippet} query={query} />
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
