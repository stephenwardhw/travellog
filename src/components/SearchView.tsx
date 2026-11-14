import React, { useMemo, useState } from 'react';
import { FileText, MapPin, Search as SearchIcon } from 'lucide-react';
import type { EventRecord, PdfRecord, SearchMatch, TripRecord } from '../types/journal';

interface SearchViewProps {
  trips: TripRecord[];
  events: EventRecord[];
  pdfs: PdfRecord[];
  onSelectEvent: (event: EventRecord) => void;
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
  pdfs,
  onSelectEvent,
}) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'events' | 'pdfs'>('all');

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

  const matches = useMemo<SearchMatch[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchMatch[] = [];

    if (scope === 'all' || scope === 'events') {
      for (const ev of events) {
        const trip = tripMap.get(ev.tripClientId);
        if (ev.location.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'location',
            snippet: ev.details || ev.journalEntry || ev.location,
          });
        } else if (ev.journalEntry.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'journal',
            snippet: buildSnippet(ev.journalEntry, q),
          });
        } else if (ev.details.toLowerCase().includes(q)) {
          results.push({
            event: ev,
            trip,
            source: 'details',
            snippet: buildSnippet(ev.details, q),
          });
        }
      }
    }

    if (scope === 'all' || scope === 'pdfs') {
      for (const pdf of pdfs) {
        const ev = eventMap.get(pdf.eventClientId);
        if (!ev) continue;
        const trip = tripMap.get(ev.tripClientId);
        const filenameMatch = pdf.filename.toLowerCase().includes(q);
        const contentMatch = pdf.extractedText.toLowerCase().includes(q);
        if (filenameMatch || contentMatch) {
          results.push({
            event: ev,
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

    return results.sort((a, b) => b.event.eventDate.localeCompare(a.event.eventDate));
  }, [query, scope, events, pdfs, tripMap, eventMap]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Search Journals & PDFs
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Searches locally cached event notes, locations, journal entries, and full text inside
          attached PDFs—even while offline.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations, journal memories, confirmation codes, PDF text..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
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
            Events & Journals
          </button>
          <button
            type="button"
            onClick={() => setScope('pdfs')}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap ${
              scope === 'pdfs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            PDF Contents
          </button>
        </div>
      </div>

      {!query.trim() ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-900 tabular-nums">
            {events.length} stops and {pdfs.length} PDF documents indexed locally
          </p>
          <p className="text-xs text-slate-500">
            Enter any keyword, confirmation number, street name, or phrase to search across all
            trips.
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
            {matches.map((m, idx) => (
              <button
                key={`${m.event.clientId}-${m.source}-${m.pdfClientId || idx}`}
                type="button"
                onClick={() => onSelectEvent(m.event)}
                className="w-full text-left p-4 sm:p-5 hover:bg-slate-50 transition-colors space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap tabular-nums">
                  <span>{m.trip?.title || 'Trip'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{m.event.eventDate}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-teal-800 inline-flex items-center gap-1">
                    {m.source === 'pdf' ? (
                      <>
                        <FileText className="w-3 h-3" />
                        PDF: {m.pdfFilename}
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
                  <HighlightedText text={m.event.location} query={query} />
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  <HighlightedText text={m.snippet} query={query} />
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
