import React, { useEffect, useState } from 'react';
import {
  BedDouble,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  HardDrive,
  LocateFixed,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { extractPdfText } from '../lib/pdfExtractor';
import { sanitizeHtml } from '../lib/htmlSanitizer';
import { RichTextEditor } from './RichTextEditor';
import type { BookingRecord, BookingStatus, PdfRecord, PhotoRecord } from '../types/journal';

interface BookingDetailDrawerProps {
  open: boolean;
  booking: BookingRecord | null;
  defaultDate?: string;
  defaultCoords?: { lat: number; lng: number } | null;
  photos: PhotoRecord[];
  pdfs: PdfRecord[];
  onClose: () => void;
  onSaveBooking: (data: {
    clientId?: string;
    name: string;
    checkInDate: string;
    checkOutDate: string;
    status: BookingStatus;
    confirmationCode: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    notes: string;
  }) => Promise<BookingRecord>;
  onDeleteBooking: (clientId: string) => Promise<void>;
  onAddBookingPhotos: (bookingClientId: string, files: FileList) => Promise<void>;
  onDeletePhoto: (clientId: string) => Promise<void>;
  onAddBookingPdfs: (
    bookingClientId: string,
    items: Array<{ file: File; extractedText: string }>
  ) => Promise<void>;
  onDeletePdf: (clientId: string) => Promise<void>;
  onOpenPhoto: (photos: PhotoRecord[], index: number, title?: string) => void;
  readOnly?: boolean;
  ownerLabel?: string;
}

const StayPhotoCard: React.FC<{
  photo: PhotoRecord;
  readOnly?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ photo, readOnly, onOpen, onDelete }) => {
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
        {!readOnly && (
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
        )}
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

export const BookingDetailDrawer: React.FC<BookingDetailDrawerProps> = ({
  open,
  booking,
  defaultDate,
  defaultCoords,
  photos,
  pdfs,
  onClose,
  onSaveBooking,
  onDeleteBooking,
  onAddBookingPhotos,
  onDeletePhoto,
  onAddBookingPdfs,
  onDeletePdf,
  onOpenPhoto,
  readOnly = false,
  ownerLabel,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [checkInDate, setCheckInDate] = useState(today);
  const [checkOutDate, setCheckOutDate] = useState(today);
  const [status, setStatus] = useState<BookingStatus>('unconfirmed');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachingPhotos, setAttachingPhotos] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const baseDate = booking?.checkInDate || defaultDate || today;
    setName(booking?.name || '');
    setCheckInDate(baseDate);
    setCheckOutDate(booking?.checkOutDate || baseDate);
    setStatus(booking?.status === 'confirmed' ? 'confirmed' : 'unconfirmed');
    setConfirmationCode(booking?.confirmationCode || '');
    setAddress(booking?.address || '');
    setLatitude(
      booking?.latitude !== null && booking?.latitude !== undefined
        ? String(booking.latitude)
        : defaultCoords
        ? String(defaultCoords.lat)
        : ''
    );
    setLongitude(
      booking?.longitude !== null && booking?.longitude !== undefined
        ? String(booking.longitude)
        : defaultCoords
        ? String(defaultCoords.lng)
        : ''
    );
    setNotes(booking?.notes || '');
    setError(null);
  }, [open, booking, defaultDate, defaultCoords, today]);

  if (!open) return null;

  const persistCurrentBooking = async (): Promise<BookingRecord> => {
    if (!name.trim()) {
      throw new Error('Accommodation / stay name is required before saving.');
    }
    if (!checkInDate || !checkOutDate) {
      throw new Error('Both check-in and check-out dates are required.');
    }
    if (checkOutDate < checkInDate) {
      throw new Error('Check-out date cannot be earlier than check-in date.');
    }
    const lat = latitude.trim() !== '' ? Number(latitude) : null;
    const lng = longitude.trim() !== '' ? Number(longitude) : null;

    return onSaveBooking({
      clientId: booking?.clientId,
      name: name.trim(),
      checkInDate,
      checkOutDate,
      status,
      confirmationCode: confirmationCode.trim(),
      address: address.trim(),
      latitude: lat !== null && Number.isFinite(lat) ? lat : null,
      longitude: lng !== null && Number.isFinite(lng) ? lng : null,
      notes: sanitizeHtml(notes),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await persistCurrentBooking();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save booking.');
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
      const saved = booking || (await persistCurrentBooking());
      await onAddBookingPhotos(saved.clientId, files);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach stay photo.');
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
      const saved = booking || (await persistCurrentBooking());
      const items: Array<{ file: File; extractedText: string }> = [];
      for (const file of Array.from(files)) {
        const text = await extractPdfText(file);
        items.push({ file, extractedText: text });
      }
      await onAddBookingPdfs(saved.clientId, items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach booking PDF.');
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
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5 text-indigo-700" />
              <span>
                {readOnly
                  ? 'Shared Stay / Booking (View only)'
                  : booking
                  ? 'Edit Stay / Booking'
                  : 'New Multiday Stay / Booking'}
              </span>
            </p>
            <h2 className="font-display text-xl font-semibold text-slate-900 truncate">
              {name || 'Untitled Accommodation'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {booking && !readOnly && (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteBooking(booking.clientId);
                  onClose();
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                aria-label="Delete booking"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close booking drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {readOnly && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
              View-only access{ownerLabel ? ` · Shared by ${ownerLabel}` : ''}. You can inspect stay
              dates, confirmation status, formatted notes, photos, coordinates, and booking PDFs.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Property / Stay Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ryokan Kuramoto / Hotel Granvia Kyoto"
                required
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:bg-slate-50 disabled:text-slate-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Check-in Date
                </label>
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => {
                    const nextIn = e.target.value;
                    setCheckInDate(nextIn);
                    if (checkOutDate < nextIn) {
                      setCheckOutDate(nextIn);
                    }
                  }}
                  required
                  disabled={readOnly}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Check-out Date
                </label>
                <input
                  type="date"
                  value={checkOutDate}
                  min={checkInDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  required
                  disabled={readOnly}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Booking Status
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setStatus('confirmed')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      status === 'confirmed'
                        ? 'bg-indigo-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirmed
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setStatus('unconfirmed')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      status === 'unconfirmed'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Unconfirmed
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Confirmation Code (optional)
                </label>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="RES-849201"
                  disabled={readOnly}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Address (optional)
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="901 Higashishiokoji-cho, Shimogyo Ward, Kyoto"
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Latitude &amp; Longitude (shows stay pin on Map)
                </label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleUseGps}
                    disabled={locatingGps}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                    {locatingGps ? 'Reading GPS...' : 'Use current GPS'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude (e.g. 34.9858)"
                  disabled={readOnly}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
                />
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (e.g. 135.7588)"
                  disabled={readOnly}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-700"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Stay Notes &amp; Check-in Details
                </label>
                {!readOnly && (
                  <span className="text-[11px] text-slate-400">
                    Supports HTML formatting &amp; web/app links
                  </span>
                )}
              </div>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder="Check-in window 15:00, door codes, breakfast hours, cancellation policy, or links to Maps, Obsidian, Notion..."
                emptyReadOnlyText="No stay notes logged."
                readOnly={readOnly}
                minHeightClass="min-h-[150px]"
              />
            </div>
          </div>

          {/* Stay Photos section */}
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Stay Photos ({photos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Room photos, entrance views, or check-in keycard instructions synced over Wi-Fi.
                </p>
              </div>
              {!readOnly && (
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[40px] whitespace-nowrap">
                  <Camera className="w-3.5 h-3.5 text-indigo-700" />
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
              )}
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, idx) => (
                  <StayPhotoCard
                    key={photo.clientId}
                    photo={photo}
                    readOnly={readOnly}
                    onOpen={() => onOpenPhoto(photos, idx, name || booking?.name)}
                    onDelete={() => onDeletePhoto(photo.clientId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Booking PDFs section */}
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Booking PDFs ({pdfs.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Attach reservation confirmations, vouchers, or check-in instructions.
                </p>
              </div>
              {!readOnly && (
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
              )}
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
                        <FileText className="w-4 h-4 text-indigo-700 shrink-0" />
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
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onDeletePdf(pdf.clientId)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white"
                          aria-label={`Delete ${pdf.filename}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 min-h-[44px]"
            >
              Close
            </button>
          ) : (
            <>
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
                {saving ? 'Saving...' : 'Save Booking'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
