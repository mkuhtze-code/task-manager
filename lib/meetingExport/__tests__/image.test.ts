import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { derivativeDimensions, jpegDataUrlToBytes } from '@/lib/meetingExport/image';

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkRohEKsSJRUjYpGC0eHwFCRDU3GC0nJzCv/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe('derivativeDimensions', () => {
  it('keeps small images as-is', () => {
    expect(derivativeDimensions(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });

  it('downscales to the requested longest edge', () => {
    expect(derivativeDimensions(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(derivativeDimensions(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('respects the compact tier', () => {
    expect(derivativeDimensions(4032, 3024, 960)).toEqual({ width: 960, height: 720 });
  });

  it('caps keep_quality at the browser canvas pixel limit for huge captures', () => {
    // A 48MP+ capture must not exceed the ~16.7M-pixel canvas area, even at
    // keep_quality (4096 longest edge).
    const { width, height } = derivativeDimensions(9600, 9600, 4096);
    expect(width * height).toBeLessThanOrEqual(4096 * 4096);
    expect(width).toBe(4096);
    expect(height).toBe(4096);
  });

  it('returns a safe 1x1 for broken zero-size sources', () => {
    expect(derivativeDimensions(0, 0, 1280)).toEqual({ width: 1, height: 1 });
  });
});

describe('jpegDataUrlToBytes (toDataURL encode fallback)', () => {
  function dataUrlFor(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  }

  it('decodes a JPEG data URL back to the identical bytes', () => {
    const original = b64ToBytes(TINY_JPEG_B64);
    const bytes = jpegDataUrlToBytes(dataUrlFor(original));
    expect(bytes).toEqual(original);
  });

  it('rejects non-JPEG data URLs', () => {
    expect(() => jpegDataUrlToBytes('data:image/png;base64,AAAA')).toThrow('Not a JPEG data URL');
  });

  it('produces bytes pdf-lib can actually embed (the encode fallback path)', async () => {
    const bytes = jpegDataUrlToBytes(dataUrlFor(b64ToBytes(TINY_JPEG_B64)));
    const pdf = await PDFDocument.create();
    const image = await pdf.embedJpg(bytes);
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
  });
});