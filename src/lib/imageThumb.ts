export async function generateThumbnailBlob(
  file: Blob,
  maxEdge = 480,
  quality = 0.82
): Promise<Blob | undefined> {
  if (typeof document === 'undefined') return undefined;

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawSource: CanvasImageSource | null = null;
    let closeBitmap: (() => void) | undefined;
    let revokeUrl: (() => void) | undefined;

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        drawSource = bitmap;
        closeBitmap = () => bitmap.close();
      } catch {
        // Fall through to HTMLImageElement loader
      }
    }

    if (!drawSource) {
      const objectUrl = URL.createObjectURL(file);
      revokeUrl = () => URL.revokeObjectURL(objectUrl);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = objectUrl;
      });
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
      drawSource = img;
    }

    try {
      if (!sourceWidth || !sourceHeight) return undefined;

      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

      const thumbBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      });

      return thumbBlob || undefined;
    } finally {
      closeBitmap?.();
      revokeUrl?.();
    }
  } catch {
    return undefined;
  }
}
