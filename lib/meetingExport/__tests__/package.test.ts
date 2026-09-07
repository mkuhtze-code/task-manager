import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildEvidencePackage,
  exportBaseName,
  exportPackageFolderName,
  exportPdfFileName,
  fileExtension,
  mediaPath,
  sanitizeFileNamePart,
  zipMeetingPackage,
} from '@/lib/meetingExport/package';
import { makeContent } from './fixtures';

describe('fileExtension', () => {
  it('maps known mimes to the original extension', () => {
    expect(fileExtension('image/jpeg')).toBe('.jpg');
    expect(fileExtension('image/JPG')).toBe('.jpg');
    expect(fileExtension('image/png')).toBe('.png');
    expect(fileExtension('image/webp')).toBe('.webp');
    expect(fileExtension('audio/m4a')).toBe('.m4a');
    expect(fileExtension('audio/mp4')).toBe('.m4a');
    expect(fileExtension('audio/x-m4a')).toBe('.m4a');
    expect(fileExtension('audio/ogg')).toBe('.ogg');
    expect(fileExtension('audio/mpeg')).toBe('.mp3');
  });

  it('falls back to .bin for unknown or missing mimes', () => {
    expect(fileExtension('application/octet-stream')).toBe('.bin');
    expect(fileExtension(null)).toBe('.bin');
    expect(fileExtension(undefined)).toBe('.bin');
  });
});

describe('mediaPath', () => {
  it('names photo/audio files with the observation ordinal and per-type index', () => {
    expect(mediaPath('photo', 4, 1, 'image/jpeg')).toBe('photos/Obs-04-photo-1.jpg');
    expect(mediaPath('audio', 4, 2, 'audio/m4a')).toBe('audio/Obs-04-audio-2.m4a');
  });

  it('zero-pads ordinals below 10', () => {
    expect(mediaPath('photo', 9, 1, null)).toBe('photos/Obs-09-photo-1.bin');
  });
});

describe('buildEvidencePackage + zipMeetingPackage', () => {
  it('keeps originals byte-for-byte under ordinals matched to the PDF', async () => {
    const photoA = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const photoB = new Blob([new Uint8Array([4, 5])], { type: 'image/png' });
    const audioA = new Blob([new Uint8Array([9, 9])], { type: 'audio/m4a' });
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const files = await buildEvidencePackage({
      pdfBytes,
      photos: [
        { mediaId: 'p1', ordinal: 2, mimeType: 'image/png', blob: photoA },
        { mediaId: 'p2', ordinal: 2, mimeType: 'image/png', blob: photoB },
        { mediaId: 'p3', ordinal: 4, mimeType: 'image/png', blob: photoB },
      ],
      audio: [{ mediaId: 'a1', ordinal: 2, mimeType: 'audio/m4a', blob: audioA }],
    });

    expect(files[0].path).toBe('Meeting Record.pdf');
    expect(files.map((f) => f.path)).toEqual([
      'Meeting Record.pdf',
      'photos/Obs-02-photo-1.png',
      'photos/Obs-02-photo-2.png',
      'photos/Obs-04-photo-1.png',
      'audio/Obs-02-audio-1.m4a',
    ]);

    const zip = await zipMeetingPackage(files);
    const entries = unzipSync(zip);
    const paths = Object.keys(entries).sort();
    expect(paths).toEqual([
      'Meeting Record.pdf',
      'audio/Obs-02-audio-1.m4a',
      'photos/Obs-02-photo-1.png',
      'photos/Obs-02-photo-2.png',
      'photos/Obs-04-photo-1.png',
    ]);
    // Original bytes survive the zip uncorrupted.
    expect([...entries['photos/Obs-02-photo-2.png']]).toEqual([4, 5]);
  });
});

describe('file naming', () => {
  it('strips characters that are illegal in filenames', () => {
    expect(sanitizeFileNamePart('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
    expect(sanitizeFileNamePart('  double   space  ')).toBe('double space');
  });

  it('builds the shared base name from job + title + meeting date', () => {
    const content = makeContent();
    const now = new Date('2025-02-03T12:00:00');
    const base = exportBaseName(content, now);
    expect(base).toBe('Acme Renovation - Site visit — foundation - 2025-01-02');
  });

  it('drops the job part when there is none and defaults an untitled meeting', () => {
    const content = makeContent({
      job: null,
      meeting: {
        id: 'm',
        user_id: 'u',
        text: '',
        duration_mins: 10,
        start_time: '2025-03-04T09:00:00',
        created_at: '',
        source: 'manual',
        job_id: null,
        location_text: null,
        lat: null,
        lng: null,
        notes: null,
        summary: null,
      },
    });
    expect(exportBaseName(content)).toBe('Meeting - 2025-03-04');
  });

  it('uses today when the meeting has no start time', () => {
    const content = makeContent({
      job: null,
      meeting: {
        id: 'm',
        user_id: 'u',
        text: 'Sync',
        duration_mins: 10,
        start_time: null,
        created_at: '',
        source: 'manual',
        job_id: null,
        location_text: null,
        lat: null,
        lng: null,
        notes: null,
        summary: null,
      },
    });
    const now = new Date('2025-02-07T00:00:00');
    expect(exportBaseName(content, now)).toBe('Sync - 2025-02-07');
  });

  it('names the pdf and the package folder from the same base', () => {
    const content = makeContent();
    const now = new Date('2025-02-03T12:00:00');
    expect(exportPdfFileName(content, now)).toMatch(/\.pdf$/);
    expect(exportPackageFolderName(content, now)).toBe('Acme Renovation - Site visit — foundation - 2025-01-02');
  });
});