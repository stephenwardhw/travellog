import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileText,
  Image as ImageIcon,
  MapPin,
  Printer,
  X,
} from 'lucide-react';
import type { EventRecord, PdfRecord, PhotoRecord, TripRecord } from '../types/journal';

interface TripReportModalProps {
  open: boolean;
  trip: TripRecord | null;
  events: EventRecord[];
  photosByEvent: Map<string, PhotoRecord[]>;
  pdfsByEvent: Map<string, PdfRecord[]>;
  authToken: string;
  onOpenPhoto: (photos: PhotoRecord[], index: number, title?: string) => void;
  onClose: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function computeTripDayNumber(tripStartIso: string, dateIso: string): number | null {
  const [sy, sm, sd] = tripStartIso.split('-').map(Number);
  const [dy, dm, dd] = dateIso.split('-').map(Number);
  if (!sy || !sm || !sd || !dy || !dm || !dd) return null;
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const dayUtc = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.round((dayUtc - startUtc) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays + 1 : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

const ReportPhotoFigure: React.FC<{
  photo: PhotoRecord;
  authToken: string;
  preferFullRes: boolean;
  onClick: () => void;
}> = ({ photo, authToken, preferFullRes, onClick }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const localBlob = preferFullRes ? photo.blob || photo.thumbBlob : photo.thumbBlob || photo.blob;

  useEffect(() => {
    if (localBlob && (!preferFullRes || photo.blob)) {
      const url = URL.createObjectURL(localBlob);
      setObjectUrl(url);
      setLoading(false);
      return () => URL.revokeObjectURL(url);
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    if (localBlob) {
      createdUrl = URL.createObjectURL(localBlob);
      setObjectUrl(createdUrl);
    }

    if (!navigator.onLine) {
      setLoading(false);
      return () => {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    setLoading(!localBlob);
    (async () => {
      try {
        const endpoint = preferFullRes
          ? `/api/photos/${encodeURIComponent(photo.clientId)}/file`
          : `/api/photos/${encodeURIComponent(photo.clientId)}/thumb`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok || cancelled) return;
        const fetchedBlob = await res.blob();
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(fetchedBlob);
        if (createdUrl) URL.revokeObjectURL(createdUrl);
        createdUrl = nextUrl;
        setObjectUrl(nextUrl);
      } catch {
        // Keep local fallback if offline or fetch fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [photo.clientId, photo.blob, photo.thumbBlob, preferFullRes, authToken]);

  return (
    <figure className="break-inside-avoid rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onClick}
        className="w-full block aspect-[4/3] bg-slate-100 overflow-hidden cursor-zoom-in focus:outline-none print:cursor-default"
        aria-label={`View full photo ${photo.filename}`}
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={photo.caption || photo.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-400 text-xs">
            <ImageIcon className="w-5 h-5" />
            <span>{loading ? 'Loading...' : 'Offline preview'}</span>
          </div>
        )}
      </button>
      <figcaption className="px-3 py-2 text-[11px] text-slate-600 truncate border-t border-slate-100">
        {photo.caption || photo.filename}
      </figcaption>
    </figure>
  );
};

export const TripReportModal: React.FC<TripReportModalProps> = ({
  open,
  trip,
  events,
  photosByEvent,
  pdfsByEvent,
  authToken,
  onOpenPhoto,
  onClose,
}) => {
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeJournal, setIncludeJournal] = useState(true);
  const [includeCoords, setIncludeCoords] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includePdfs, setIncludePdfs] = useState(true);
  const [preferFullRes, setPreferFullRes] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportingHtml, setExportingHtml] = useState(false);

  const chronologicalEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const dateCmp = a.eventDate.localeCompare(b.eventDate);
      if (dateCmp !== 0) return dateCmp;
      return (a.eventTime || '').localeCompare(b.eventTime || '');
    });
  }, [events]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (const ev of chronologicalEvents) {
      const list = map.get(ev.eventDate) || [];
      list.push(ev);
      map.set(ev.eventDate, list);
    }
    return Array.from(map.entries());
  }, [chronologicalEvents]);

  const totals = useMemo(() => {
    let photoCount = 0;
    let pdfCount = 0;
    for (const ev of chronologicalEvents) {
      photoCount += photosByEvent.get(ev.clientId)?.length || 0;
      pdfCount += pdfsByEvent.get(ev.clientId)?.length || 0;
    }
    return {
      days: groupedByDate.length,
      stops: chronologicalEvents.length,
      photos: photoCount,
      pdfs: pdfCount,
    };
  }, [chronologicalEvents, groupedByDate.length, photosByEvent, pdfsByEvent]);

  useEffect(() => {
    if (!open) return;
    setExportStatus(null);
  }, [open, trip?.clientId]);

  if (!open || !trip) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = async () => {
    setExportingHtml(true);
    setExportStatus('Collecting trip details...');
    try {
      const dataUrlByPhotoId = new Map<string, string>();
      if (includePhotos && totals.photos > 0) {
        let processed = 0;
        for (const ev of chronologicalEvents) {
          const evPhotos = photosByEvent.get(ev.clientId) || [];
          for (const photo of evPhotos) {
            processed++;
            setExportStatus(`Embedding photos (${processed} / ${totals.photos})...`);
            let blobToEmbed: Blob | undefined = photo.blob;

            if (!blobToEmbed && navigator.onLine) {
              try {
                const res = await fetch(
                  `/api/photos/${encodeURIComponent(photo.clientId)}/file`,
                  { headers: { Authorization: `Bearer ${authToken}` } }
                );
                if (res.ok) {
                  blobToEmbed = await res.blob();
                }
              } catch {
                // Fall back to thumb if network fails
              }
            }

            if (!blobToEmbed) {
              blobToEmbed = photo.thumbBlob;
            }

            if (blobToEmbed) {
              try {
                const dataUrl = await blobToDataUrl(blobToEmbed);
                if (dataUrl) {
                  dataUrlByPhotoId.set(photo.clientId, dataUrl);
                }
              } catch {
                // Skip unreadable blob
              }
            }
          }
        }
      }

      setExportStatus('Building HTML report...');

      const daySectionsHtml = groupedByDate
        .map(([dateIso, dayEvents]) => {
          const dayNum = computeTripDayNumber(trip.startDate, dateIso);
          const eventsHtml = dayEvents
            .map((ev) => {
              const evPhotos = includePhotos ? photosByEvent.get(ev.clientId) || [] : [];
              const evPdfs = includePdfs ? pdfsByEvent.get(ev.clientId) || [] : [];

              const photosHtml =
                evPhotos.length > 0
                  ? `<div class="photo-grid">${evPhotos
                      .map((p) => {
                        const src = dataUrlByPhotoId.get(p.clientId);
                        const label = escapeHtml(p.caption || p.filename);
                        return src
                          ? `<figure class="photo-card"><img src="${src}" alt="${label}" /><figcaption>${label}</figcaption></figure>`
                          : `<figure class="photo-card missing"><div class="missing-box">Photo unavailable offline (${label})</div><figcaption>${label}</figcaption></figure>`;
                      })
                      .join('')}</div>`
                  : '';

              const pdfsHtml =
                evPdfs.length > 0
                  ? `<div class="pdf-list"><strong>Attached Documents:</strong> ${evPdfs
                      .map((pdf) => `${escapeHtml(pdf.filename)} (${formatBytes(pdf.sizeBytes)})`)
                      .join(' · ')}</div>`
                  : '';

              return `
                <article class="stop">
                  <div class="stop-meta">
                    <span class="stop-time">${escapeHtml(ev.eventTime || 'All day')}</span>
                    ${
                      includeCoords && ev.latitude !== null && ev.longitude !== null
                        ? `<span class="stop-coords">${ev.latitude.toFixed(5)}, ${ev.longitude.toFixed(5)}</span>`
                        : ''
                    }
                  </div>
                  <h3>${escapeHtml(ev.location)}</h3>
                  ${
                    includeDetails && ev.details.trim()
                      ? `<p class="details">${escapeHtml(ev.details)}</p>`
                      : ''
                  }
                  ${
                    includeJournal && ev.journalEntry.trim()
                      ? `<div class="journal">${escapeHtml(ev.journalEntry)}</div>`
                      : ''
                  }
                  ${photosHtml}
                  ${pdfsHtml}
                </article>
              `;
            })
            .join('');

          return `
            <section class="day-section">
              <div class="day-header">
                <h2>${escapeHtml(formatLongDate(dateIso))}</h2>
                <span class="day-sub">${dayNum ? `Day ${dayNum} · ` : ''}${dayEvents.length} ${
                  dayEvents.length === 1 ? 'stop' : 'stops'
                }</span>
              </div>
              ${eventsHtml}
            </section>
          `;
        })
        .join('');

      const htmlDoc = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(trip.title)} — TravelLog Report</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      line-height: 1.6;
    }
    .sheet {
      max-width: 880px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 40px;
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f766e;
      margin: 0 0 8px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 32px;
      line-height: 1.15;
      margin: 0 0 10px;
    }
    .trip-meta {
      font-size: 13px;
      color: #475569;
      margin: 0 0 16px;
    }
    .trip-desc {
      font-size: 14px;
      color: #334155;
      background: #f8fafc;
      border-left: 3px solid #0f766e;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0 24px;
      white-space: pre-wrap;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 16px 0;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 28px;
    }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
    .day-section { margin-top: 32px; }
    .day-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 6px;
      margin-bottom: 18px;
    }
    .day-header h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 20px;
      margin: 0;
    }
    .day-sub { font-size: 12px; color: #475569; font-variant-numeric: tabular-nums; }
    .stop {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 16px;
      break-inside: avoid;
    }
    .stop-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: #64748b;
      font-variant-numeric: tabular-nums;
      margin-bottom: 4px;
    }
    .stop h3 {
      font-size: 17px;
      margin: 0 0 8px;
      color: #0f172a;
    }
    .details {
      font-size: 13px;
      color: #475569;
      margin: 0 0 10px;
      white-space: pre-wrap;
    }
    .journal {
      font-size: 14px;
      color: #1e293b;
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px 14px;
      margin: 10px 0 0;
      white-space: pre-wrap;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .photo-card {
      margin: 0;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
      break-inside: avoid;
    }
    .photo-card img {
      display: block;
      width: 100%;
      height: 180px;
      object-fit: cover;
    }
    .photo-card figcaption {
      padding: 6px 10px;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid #f1f5f9;
      word-break: break-word;
    }
    .missing-box {
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      color: #64748b;
      font-size: 11px;
      padding: 10px;
      text-align: center;
    }
    .pdf-list {
      margin-top: 12px;
      font-size: 12px;
      color: #475569;
      padding-top: 10px;
      border-top: 1px solid #f1f5f9;
    }
    .footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: none; padding: 0; max-width: none; }
    }
    @media (max-width: 600px) {
      .sheet { padding: 20px; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <p class="eyebrow">TravelLog Trip Report</p>
    <h1>${escapeHtml(trip.title)}</h1>
    <p class="trip-meta">
      ${trip.destination ? `${escapeHtml(trip.destination)} · ` : ''}${escapeHtml(
        trip.startDate
      )} – ${escapeHtml(trip.endDate)}${
        trip.accessRole && trip.accessRole !== 'owner'
          ? ` · Shared by ${escapeHtml(trip.ownerName || trip.ownerEmail || 'Owner')}`
          : ''
      }
    </p>
    ${trip.description.trim() ? `<div class="trip-desc">${escapeHtml(trip.description)}</div>` : ''}
    <div class="stats">
      <div><div class="stat-label">Logged Days</div><div class="stat-value">${totals.days}</div></div>
      <div><div class="stat-label">Stops</div><div class="stat-value">${totals.stops}</div></div>
      <div><div class="stat-label">Photos</div><div class="stat-value">${totals.photos}</div></div>
      <div><div class="stat-label">Documents</div><div class="stat-value">${totals.pdfs}</div></div>
    </div>
    ${
      groupedByDate.length === 0
        ? '<p style="color:#64748b;font-size:14px;">No stops logged for this trip yet.</p>'
        : daySectionsHtml
    }
    <footer class="footer">Generated with TravelLog on ${escapeHtml(
      new Date().toLocaleDateString()
    )}</footer>
  </main>
</body>
</html>`;

      const slug = trip.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'trip';
      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}-report.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus('HTML report downloaded with embedded trip details and photos.');
    } catch (err: unknown) {
      setExportStatus(
        err instanceof Error ? err.message : 'Unable to generate downloadable HTML report.'
      );
    } finally {
      setExportingHtml(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trip report: ${trip.title}`}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 print:static print:inset-auto print:bg-white print:p-0 print:overflow-visible"
    >
      <div className="max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* Sticky Controls Header (hidden when printing) */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3.5 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                Trip Report Preview
              </p>
              <h2 className="font-display text-lg font-semibold text-slate-900 truncate">
                {trip.title}
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[38px]"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                Print / Save PDF
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={exportingHtml}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[38px]"
              >
                <Download className="w-3.5 h-3.5" />
                {exportingHtml ? 'Exporting...' : 'Download HTML'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close trip report"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDetails}
                onChange={(e) => setIncludeDetails(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Itinerary details
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeJournal}
                onChange={(e) => setIncludeJournal(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Journal entries
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoords}
                onChange={(e) => setIncludeCoords(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Coordinates
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Photos
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includePdfs}
                onChange={(e) => setIncludePdfs(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              PDF list
            </label>
            {includePhotos && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferFullRes}
                  onChange={(e) => setPreferFullRes(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                High-res preview
              </label>
            )}
          </div>

          {exportStatus && (
            <p className="text-xs font-medium text-teal-800">{exportStatus}</p>
          )}
        </div>

        {/* Printable Report Body */}
        <div className="p-6 sm:p-10 space-y-8 print:p-0">
          {/* Report Cover Header */}
          <header className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
              TravelLog Report
            </p>
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
                {trip.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600 tabular-nums">
                {trip.destination && (
                  <>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <MapPin className="w-3.5 h-3.5 text-teal-700" />
                      {trip.destination}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {trip.startDate} – {trip.endDate}
                </span>
                {trip.accessRole && trip.accessRole !== 'owner' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Shared by {trip.ownerName || trip.ownerEmail || 'Owner'}</span>
                  </>
                )}
              </div>
            </div>

            {trip.description.trim() && (
              <p className="text-sm text-slate-700 bg-slate-50 border-l-4 border-teal-700 px-4 py-3 rounded-r-lg whitespace-pre-wrap leading-relaxed">
                {trip.description}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-200 tabular-nums">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Logged Days</p>
                <p className="text-xl font-bold text-slate-900">{totals.days}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Stops</p>
                <p className="text-xl font-bold text-slate-900">{totals.stops}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Photos</p>
                <p className="text-xl font-bold text-slate-900">{totals.photos}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Documents</p>
                <p className="text-xl font-bold text-slate-900">{totals.pdfs}</p>
              </div>
            </div>
          </header>

          {/* Day-by-Day Chronological Itinerary & Journal */}
          {groupedByDate.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No stops or journal entries have been logged for this trip yet.
            </div>
          ) : (
            <div className="space-y-8">
              {groupedByDate.map(([dateIso, dayEvents]) => {
                const dayNumber = computeTripDayNumber(trip.startDate, dateIso);
                return (
                  <section key={dateIso} className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-teal-700 pb-2">
                      <h2 className="font-display text-xl font-semibold text-slate-900">
                        {formatLongDate(dateIso)}
                      </h2>
                      <span className="text-xs font-medium text-slate-500 tabular-nums">
                        {dayNumber ? `Day ${dayNumber} · ` : ''}
                        {dayEvents.length} {dayEvents.length === 1 ? 'stop' : 'stops'}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {dayEvents.map((ev) => {
                        const evPhotos = includePhotos ? photosByEvent.get(ev.clientId) || [] : [];
                        const evPdfs = includePdfs ? pdfsByEvent.get(ev.clientId) || [] : [];

                        return (
                          <article
                            key={ev.clientId}
                            className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 tabular-nums">
                              <span className="font-semibold text-teal-800">
                                {ev.eventTime || 'All day'}
                              </span>
                              {includeCoords && ev.latitude !== null && ev.longitude !== null && (
                                <span>
                                  {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}
                                </span>
                              )}
                            </div>

                            <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                              {ev.location}
                            </h3>

                            {includeDetails && ev.details.trim() && (
                              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {ev.details}
                              </p>
                            )}

                            {includeJournal && ev.journalEntry.trim() && (
                              <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                {ev.journalEntry}
                              </div>
                            )}

                            {evPhotos.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                                {evPhotos.map((photo, idx) => (
                                  <ReportPhotoFigure
                                    key={photo.clientId}
                                    photo={photo}
                                    authToken={authToken}
                                    preferFullRes={preferFullRes}
                                    onClick={() => onOpenPhoto(evPhotos, idx, ev.location)}
                                  />
                                ))}
                              </div>
                            )}

                            {evPdfs.length > 0 && (
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                                  Documents:
                                </span>
                                {evPdfs.map((pdf) => (
                                  <span key={pdf.clientId} className="tabular-nums">
                                    {pdf.filename} ({formatBytes(pdf.sizeBytes)})
                                  </span>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          <footer className="pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400 tabular-nums">
            Generated with TravelLog · {new Date().toLocaleDateString()}
          </footer>
        </div>
      </div>
    </div>
  );
};
