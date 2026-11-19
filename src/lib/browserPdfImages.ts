import { detectImageFormatFromBytes, type PdfPhotoLike, type ResolvedPdfImage } from './tripPdfBuilder';

async function convertBlobViaCanvasToJpeg(blob: Blob): Promise<ResolvedPdfImage | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.86)
    );
    if (!jpegBlob) return null;
    const buf = await jpegBlob.arrayBuffer();
    return { bytes: new Uint8Array(buf), format: 'JPEG' };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function resolveBrowserPhotoForPdf(
  photo: PdfPhotoLike,
  authToken: string,
  preferFullRes = false
): Promise<ResolvedPdfImage | null> {
  let targetBlob: Blob | undefined = preferFullRes
    ? photo.blob || photo.thumbBlob
    : photo.thumbBlob || photo.blob;

  if ((!targetBlob || (preferFullRes && !photo.blob)) && typeof navigator !== 'undefined' && navigator.onLine && authToken) {
    try {
      const endpoint = preferFullRes
        ? `/api/photos/${encodeURIComponent(photo.clientId)}/file`
        : `/api/photos/${encodeURIComponent(photo.clientId)}/thumb`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        targetBlob = await res.blob();
      }
    } catch {
      // Keep local fallback
    }
  }

  if (!targetBlob) return null;

  const rawBytes = new Uint8Array(await targetBlob.arrayBuffer());
  const detected = detectImageFormatFromBytes(rawBytes);
  if (detected) {
    return { bytes: rawBytes, format: detected };
  }

  // Fallback for WebP / GIF / AVIF: rasterize onto offscreen canvas as JPEG
  return convertBlobViaCanvasToJpeg(targetBlob);
}
