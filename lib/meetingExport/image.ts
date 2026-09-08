import type { MeetingPdfQuality } from './types';

// ── Photo optimisation for the PDF ────────────────────────────────────
// Browser-only (canvas + decode APIs — never imported by Node tests).
// Every exported photo becomes a JPEG presentation derivative: downscaled to
// a sane size and re-encoded, so a 12MP camera shot doesn't make a 100MB
// PDF. The ORIGINAL bytes are never touched — the Evidence Package always
// contains the untouched originals regardless of what the PDF used.
//
// Decode is deliberately multipath: capture stores whatever the device's
// <input type="file"> handed us (image/jpeg, image/webp, image/heic, …) and
// the path that decodes differs across engines. The reliable universal
// fallback is an <img> resolved via its load/error events — Image.decode()
// is known to reject on some Safari/WebView builds for blob: URLs, and
// createImageBitmap is absent or flaky on older ones. We try the fast path
// first, then the event-based path, and only then treat the photo as
// genuinely unusable (an undecodable format such as HEIC stays out of the
// PDF but the original still travels in the Evidence Package).

export type MeetingExportPhotoAsset = {
  mediaId: string;
  mimeType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

// Quality tiers: presentation size (longest edge) · JPEG quality.
const TIER_SIZES: Record<MeetingPdfQuality, number> = {
  standard: 1280,
  compact: 960,
  keep_quality: 4096, // "keep quality" ≈ unresized presentation (never alters the source)
};
const TIER_JPEG_QUALITY: Record<MeetingPdfQuality, number> = {
  standard: 0.72,
  compact: 0.6,
  keep_quality: 0.9,
};

// iOS Safari caps the canvas backing store at ~4096px per side and ~16.7M
// pixels, so keep_quality on a 48MP capture must not exceed that area.
const MAX_CANVAS_PIXELS = 4096 * 4096;

// Pure sizing: fit the source longest edge into `maxSide`, and never exceed
// the mobile canvas area limit. Exported so the geometry is testable in Node.
export function derivativeDimensions(srcW: number, srcH: number, maxSide: number): { width: number; height: number } {
  if (!(srcW > 0 && srcH > 0)) return { width: 1, height: 1 };
  let scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  let width = Math.round(srcW * scale);
  let height = Math.round(srcH * scale);
  if (width * height > MAX_CANVAS_PIXELS) {
    scale = Math.sqrt(MAX_CANVAS_PIXELS / (srcW * srcH));
    width = Math.round(srcW * scale);
    height = Math.round(srcH * scale);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

// Pure decode of a JPEG data URL (the toDataURL encode fallback) into bytes
// pdf-lib can embed. Exported so the fallback path is testable in Node.
export function jpegDataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
  if (!head.startsWith('data:image/jpeg')) throw new Error('Not a JPEG data URL');
  const b64 = dataUrl.slice(comma + 1).replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bitmapSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function closeSource(source: ImageBitmap | HTMLImageElement): void {
  if (typeof (source as ImageBitmap).close === 'function') {
    (source as ImageBitmap).close();
  }
}

// Decode by any reliable browser path. Falls through to the event-based
// <img> path (load/error) rather than trusting Image.decode(), which rejects
// on Safari/WebView builds for blob: URLs. Throws only when no path can
// decode the bytes at all.
async function decodeImage(blob: Blob): Promise<{ source: ImageBitmap | HTMLImageElement; objectUrl: string | null }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: honour EXIF so phone photos aren't drawn sideways.
      return { source: await createImageBitmap(blob, { imageOrientation: 'from-image' }), objectUrl: null };
    } catch {
      try {
        return { source: await createImageBitmap(blob), objectUrl: null };
      } catch {
        // fall through to the <img> path
      }
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    if (img.naturalWidth === 0 || img.naturalHeight === 0) throw new Error('Image has no size');
    return { source: img, objectUrl: url };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

// Encode the canvas to a JPEG Blob. toBlob is the standard path; when it is
// absent or returns null (some engines fail silently on large canvases) the
// universally supported toDataURL path takes over.
async function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob) return blob;
  }
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return new Blob([jpegDataUrlToBytes(dataUrl)], { type: 'image/jpeg' });
}

export async function optimiseMeetingPhoto(
  blob: Blob,
  quality: MeetingPdfQuality,
  mediaId: string
): Promise<MeetingExportPhotoAsset> {
  const decoded = await decodeImage(blob);
  const { source, objectUrl } = decoded;
  try {
    const { width: srcW, height: srcH } = bitmapSize(source);
    if (srcW <= 0 || srcH <= 0) throw new Error('Image has no dimensions');

    const { width, height } = derivativeDimensions(srcW, srcH, TIER_SIZES[quality]);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(source, 0, 0, width, height);

    const jpeg = await toJpegBlob(canvas, TIER_JPEG_QUALITY[quality]);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());

    if (typeof window !== 'undefined') {
      console.warn('[meetingExport:image] derivative ready', {
        mediaId,
        sourceW: srcW,
        sourceH: srcH,
        width,
        height,
        jpegBytes: bytes.byteLength,
      });
    }
    return { mediaId, mimeType: 'image/jpeg', bytes, width, height };
  } finally {
    closeSource(source);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}