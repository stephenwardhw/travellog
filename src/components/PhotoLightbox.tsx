import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PhotoRecord } from '../types/journal';

interface PhotoLightboxProps {
  photos: PhotoRecord[];
  initialIndex: number;
  title?: string;
  authToken: string;
  onClose: () => void;
  onCacheFullPhoto?: (clientId: string, blob: Blob) => Promise<void>;
}

const LightboxThumb: React.FC<{
  photo: PhotoRecord;
  active: boolean;
  onClick: () => void;
}> = ({ photo, active, onClick }) => {
  const [url, setUrl] = useState<string | null>(null);
  const sourceBlob = photo.thumbBlob || photo.blob;

  useEffect(() => {
    if (!sourceBlob) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(sourceBlob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [sourceBlob]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${photo.filename}`}
      className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
        active
          ? 'border-teal-400 opacity-100 scale-105'
          : 'border-white/20 opacity-60 hover:opacity-90'
      }`}
    >
      {url ? (
        <img
          src={url}
          alt={photo.caption || photo.filename}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-slate-800" />
      )}
    </button>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex,
  title,
  authToken,
  onClose,
  onCacheFullPhoto,
}) => {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, photos.length - 1))
  );
  const [zoomed, setZoomed] = useState(false);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentPhoto = photos[index];

  useEffect(() => {
    setIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)));
    setZoomed(false);
  }, [initialIndex, photos.length]);

  // Fast thumbnail preview while high-res loads if needed
  useEffect(() => {
    if (!currentPhoto?.thumbBlob) {
      setPreviewUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(currentPhoto.thumbBlob);
    setPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [currentPhoto?.clientId, currentPhoto?.thumbBlob]);

  // High-resolution image resolution (local IndexedDB blob first, or fetch on demand)
  useEffect(() => {
    if (!currentPhoto) return;
    setZoomed(false);
    setLoadError(null);

    if (currentPhoto.blob) {
      const objUrl = URL.createObjectURL(currentPhoto.blob);
      setFullUrl(objUrl);
      setLoadingFull(false);
      return () => URL.revokeObjectURL(objUrl);
    }

    let cancelled = false;
    let fetchedObjUrl: string | null = null;
    setFullUrl(null);
    setLoadingFull(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/photos/${encodeURIComponent(currentPhoto.clientId)}/file`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) {
          throw new Error(`Unable to load full-resolution photo (${res.status}).`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        fetchedObjUrl = URL.createObjectURL(blob);
        setFullUrl(fetchedObjUrl);
        if (onCacheFullPhoto) {
          onCacheFullPhoto(currentPhoto.clientId, blob).catch(() => {});
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Full-resolution image is unavailable offline.'
          );
        }
      } finally {
        if (!cancelled) setLoadingFull(false);
      }
    })();

    return () => {
      cancelled = true;
      if (fetchedObjUrl) URL.revokeObjectURL(fetchedObjUrl);
    };
  }, [currentPhoto, authToken, onCacheFullPhoto]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        setIndex((i) => (i - 1 + photos.length) % photos.length);
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        setIndex((i) => (i + 1) % photos.length);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, photos.length]);

  if (!currentPhoto) return null;

  const displaySrc = fullUrl || previewUrl;

  const handleDownload = () => {
    if (!fullUrl) return;
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = currentPhoto.filename || 'photo.jpg';
    link.click();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo lightbox: ${currentPhoto.filename}`}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-sm flex flex-col text-white select-none"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-300 tabular-nums">
            <span>
              {index + 1} / {photos.length}
            </span>
            {title && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{title}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{formatFileSize(currentPhoto.sizeBytes)}</span>
          </div>
          <p className="text-sm font-medium text-white truncate">
            {currentPhoto.caption || currentPhoto.filename}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            disabled={!fullUrl}
            aria-label={zoomed ? 'Fit image to screen' : 'Zoom image'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 disabled:opacity-40 transition-colors"
            title={zoomed ? 'Fit to screen' : 'Zoom in'}
          >
            {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!fullUrl}
            aria-label="Download full-resolution image"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 disabled:opacity-40 transition-colors"
            title="Download full resolution"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lightbox"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/15 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main High-Resolution Stage */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto">
        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + photos.length) % photos.length);
            }}
            aria-label="Previous photo"
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-slate-900/75 border border-white/15 text-white flex items-center justify-center hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {displaySrc ? (
          <div
            className={`relative flex items-center justify-center ${
              zoomed ? 'max-w-none' : 'max-w-full max-h-full'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (fullUrl) setZoomed((z) => !z);
            }}
          >
            <img
              src={displaySrc}
              alt={currentPhoto.caption || currentPhoto.filename}
              className={`rounded-lg shadow-2xl transition-transform duration-200 ${
                zoomed
                  ? 'max-w-none max-h-none cursor-zoom-out'
                  : 'max-w-[92vw] max-h-[75vh] object-contain cursor-zoom-in'
              } ${!fullUrl && previewUrl ? 'opacity-75' : 'opacity-100'}`}
            />
            {loadingFull && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900/85 border border-white/15 px-3 py-1.5 text-xs text-slate-200 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                <span>Loading high resolution...</span>
              </div>
            )}
          </div>
        ) : loadingFull ? (
          <div className="flex flex-col items-center gap-2 text-sm text-slate-300">
            <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
            <span>Loading high-resolution photo...</span>
          </div>
        ) : (
          <div
            className="rounded-xl border border-white/15 bg-slate-900/90 px-5 py-4 text-sm text-slate-200 max-w-md text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {loadError || 'Photo unavailable offline until synced.'}
          </div>
        )}

        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % photos.length);
            }}
            aria-label="Next photo"
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-slate-900/75 border border-white/15 text-white flex items-center justify-center hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {photos.length > 1 && (
        <div
          className="px-4 py-3 border-t border-white/10 bg-slate-950/75 flex items-center justify-center gap-2 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((photo, idx) => (
            <LightboxThumb
              key={photo.clientId}
              photo={photo}
              active={idx === index}
              onClick={() => setIndex(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
