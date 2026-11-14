import React, { useEffect, useState } from 'react';
import {
  Camera,
  FileText,
  LocateFixed,
  Maximize2,
  Trash2,
  Upload,
  X,
  ExternalLink,
  HardDrive,
} from 'lucide-react';
import { extractPdfText } from '../lib/pdfExtractor';
import type { EventRecord, PdfRecord, PhotoRecord } from '../types/journal';

interface EventDetailDrawerProps {
  open: boolean;
  event: EventRecord | null;
  defaultDate?: string;
  defaultCoords?: { lat: number; lng: number } | null;
  photos: PhotoRecord[];
  pdfs: PdfRecord[];
  onClose: () => void;
  onSaveEvent: (
    data: {
      clientId?: string;
      eventDate: string;
      eventTime: string;
      location: string;
      latitude: number | null;
      longitude: number | null;
      details: string;
      journalEntry: string;
    }
  ) => Promise<EventRecord>;
  onDeleteEvent: (clientId: string) => Promise<void>;
  onAddPhotos: (eventClientId: string, files: FileList) => Promise<void>;
  onDeletePhoto: (clientId: string) => Promise<void>;
  onAddPdfs: (
    eventClientId: string,
    items: Array<{ file: File; extractedText: string }>
  ) => Promise<void>;
  onDeletePdf: (clientId: string) => Promise<void>;
  onOpenPhoto: (photos: PhotoRecord[], index: number, title?: string) => void;
}

const PhotoCard: React.FC<{
  photo: PhotoRecord;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ photo, onOpen, onDelete }) => {
  const [url, setUrl] = useState<string | null>(null);
  const displayBlob = photo.thumbBlob || photo.blob;

  useEffect(() => {
    if (!displayBlob) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(displayBlob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [displayBlob]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
      <div className="aspect-4/3 bg-slate-100 relative overflow-hidden">
        {url ? (
          <button
            type="button"
            onClick={onOpen}
            className="w-full h-full block group relative cursor-zoom-in focus:outline-none"
            aria-label={`View high-resolution ${photo.filename}`}
          >
            <img
              src={url}
              alt={photo.caption || photo.filename}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <span className="absolute bottom-2 left-2 w-7 h-7 rounded-lg bg-slate-900/65 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3.5 h-3.5" />
            </span>
          </button>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-xs text-slate-500">
            <HardDrive className="w-5 h-5 mb-1 text-slate-400" />
            <span>Waiting for Wi-Fi download</span>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-slate-900/70 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
          aria-label={`Delete ${photo.filename}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-2.5 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-600">
        <span className="truncate">{photo.filename}</span>
        <span className="shrink-0 tabular-nums text-slate-400">
          {photo.syncStatus === 'pending' ? 'Queued' : 'Synced'}
        </span>
      </div>
    </div>
  );
};

export const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({
  open,
  event,
  defaultDate,
  defaultCoords,
  photos,
  pdfs,
  onClose,
  onSaveEvent,
  onDeleteEvent,
  onAddPhotos,
  onDeletePhoto,
  onAddPdfs,
  onDeletePdf,
  onOpenPhoto,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(today);
  const [eventTime, setEventTime] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [details, setDetails] = useState('');
  const [journalEntry, setJournalEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachingPhotos, setAttachingPhotos] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocation(event?.location || '');
    setEventDate(event?.eventDate || defaultDate || today);
    setEventTime(event?.eventTime || '');
    setLatitude(
      event?.latitude !== null && event?.latitude !== undefined
        ? String(event.latitude)
        : defaultCoords
        ? String(defaultCoords.lat)
        : ''
    );
    setLongitude(
      event?.longitude !== null && event?.longitude !== undefined
        ? String(event.longitude)
        : defaultCoords
        ? String(defaultCoords.lng)
        : ''
    );
    setDetails(event?.details || '');
    setJournalEntry(event?.journalEntry || '');
    setError(null);
  }, [open, event, defaultDate, defaultCoords, today]);

  if (!open) return null;

  const persistCurrentEvent = async (): Promise<EventRecord> => {
    if (!location.trim()) {
      throw new Error('Location name is required before saving or attaching files.');
    }
    const lat = latitude.trim() !== '' ? Number(latitude) : null;
    const lng = longitude.trim() !== '' ? Number(longitude) : null;
    return onSaveEvent({
      clientId: event?.clientId,
      eventDate,
      eventTime: eventTime.trim(),
      location: location.trim(),
      latitude: lat !== null && Number.isFinite(lat) ? lat : null,
      longitude: lng !== null && Number.isFinite(lng) ? lng : null,
      details: details.trim(),
      journalEntry,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await persistCurrentEvent();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save stop.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setAttachingPhotos(true);
    try {
      const saved = event || (await persistCurrentEvent());
      await onAddPhotos(saved.clientId, files);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach photo.');
    } finally {
      setAttachingPhotos(false);
      e.target.value = '';
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setExtractingPdf(true);
    try {
      const saved = event || (await persistCurrentEvent());
      const items: Array<{ file: File; extractedText: string }> = [];
      for (const file of Array.from(files)) {
        const text = await extractPdfText(file);
        items.push({ file, extractedText: text });
      }
      await onAddPdfs(saved.clientId, items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach PDF.');
    } finally {
      setExtractingPdf(false);
      e.target.value = '';
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this browser.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(5));
        setLongitude(pos.coords.longitude.toFixed(5));
        setLocatingGps(false);
      },
      () => {
        setError('Unable to read GPS location. Check browser location permissions.');
        setLocatingGps(false);
      }
    );
  };

  const handleOpenPdf = (pdf: PdfRecord) => {
    if (!pdf.blob) {
      setError('PDF binary is waiting for Wi-Fi download from the server.');
      return;
    }
    const url = URL.createObjectURL(pdf.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = pdf.filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl border-l border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              {event ? 'Edit Stop & Daily Journal' : 'New Itinerary Stop'}
            </p>
            <h2 className="font-display text-xl font-semibold text-slate-900 truncate">
              {location || 'Untitled Stop'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event && (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteEvent(event.clientId);
                  onClose();
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                aria-label="Delete stop"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Location / Stop Name
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Arashiyama Bamboo Grove"
                required
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Time (optional)
                </label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Coordinates (optional)
                </label>
                <button
                  type="button"
                  onClick={handleUseGps}
                  disabled={locatingGps}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  {locatingGps ? 'Reading GPS...' : 'Use current GPS'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude (e.g. 35.0168)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (e.g. 135.6713)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Itinerary Details & Logistics
              </label>
              <textarea
                rows={2}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Reservation numbers, transit routes, opening hours..."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">
              Journal of the Day
            </label>
            <textarea
              rows={6}
              value={journalEntry}
              onChange={(e) => setJournalEntry(e.target.value)}
              placeholder="Write your reflections, highlights, meals, people you met, and impressions of the day..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm leading-relaxed text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          {/* Photos section */}
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Photos ({photos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Saved on server disk and synced across devices over Wi-Fi.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[40px] whitespace-nowrap">
                <Camera className="w-3.5 h-3.5 text-teal-700" />
                {attachingPhotos ? 'Processing...' : 'Attach Photos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={attachingPhotos}
                />
              </label>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <PhotoCard
                    key={photo.clientId}
                    photo={photo}
                    onOpen={() => onOpenPhoto(photos, idx, location || event?.location)}
                    onDelete={() => onDeletePhoto(photo.clientId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* PDFs section */}
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  PDF Documents ({pdfs.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Text is indexed automatically for offline & cross-trip search.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[40px] whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-teal-700" />
                {extractingPdf ? 'Indexing PDF...' : 'Attach PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  onChange={handlePdfUpload}
                  className="hidden"
                  disabled={extractingPdf}
                />
              </label>
            </div>

            {pdfs.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.clientId}
                    className="p-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {pdf.filename}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {(pdf.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                        {pdf.extractedText
                          ? `${pdf.extractedText.length.toLocaleString()} indexed chars`
                          : 'No selectable text detected'}{' '}
                        · {pdf.syncStatus === 'pending' ? 'Queued for Wi-Fi' : 'Synced'}
                      </p>
                      {pdf.extractedText && (
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {pdf.extractedText}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(pdf)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-600 hover:text-teal-700 hover:bg-white"
                        aria-label={`Download or view ${pdf.filename}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePdf(pdf.clientId)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white"
                        aria-label={`Delete ${pdf.filename}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 min-h-[44px]"
          >
            {saving ? 'Saving...' : 'Save Stop & Journal'}
          </button>
        </div>
      </div>
    </div>
  );
};
