import type { MeetingPdfQuality } from './types';

// ── Photo optimisation for the PDF ────────────────────────────────────
// Browser-only (canvas + createImageBitmap — never imported by Node tests).
// Every exported photo becomes a JPEG presentation derivative: downscaled to
// a sane size and re-encoded, so a 12MP camera shot doesn't make a 100MB
// PDF. The ORIGINAL bytes are never touched — the Evidence Package always
// contains the untouched originals regardless of what the PDF used.

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
  keep_quality: 4096, // effectively unresized — "keep quality" means the PDF
  // embeds a near-original size JPEG, not that the source is ever altered.
};
const TIER_JPEG_QUALITY: Record<MeetingPdfQuality, number> = {
  standard: 0.72,
  compact: 0.6,
  keep_quality: 0.9,
};

async function decodeBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bitmapSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return { width: source.width, height: source.height };
}

function toCanvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Photo encode failed'))),
      'image/jpeg',
      quality
    );
  });
}

export async function optimiseMeetingPhoto(
  blob: Blob,
  quality: MeetingPdfQuality,
  mediaId: string
): Promise<MeetingExportPhotoAsset> {
  const source = await decodeBitmap(blob);
  const { width: srcW, height: srcH } = bitmapSize(source);
  if (typeof (source as ImageBitmap).close === 'function') {
    (source as ImageBitmap).close();
  }
  const maxSide = TIER_SIZES[quality];
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  const jpeg = await toCanvasBlob(canvas, TIER_JPEG_QUALITY[quality]);
  return {
    mediaId,
    mimeType: 'image/jpeg',
    bytes: new Uint8Array(await jpeg.arrayBuffer()),
    width,
    height,
  };
}