import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEETING_EXPORT_PREFS,
  normalizeMeetingExportPrefs,
  serializeMeetingExportPrefs,
} from '@/lib/meetingExport/preferences';

describe('normalizeMeetingExportPrefs', () => {
  it('returns the full defaults for missing/empty input', () => {
    expect(normalizeMeetingExportPrefs(undefined)).toEqual(DEFAULT_MEETING_EXPORT_PREFS);
    expect(normalizeMeetingExportPrefs(null)).toEqual(DEFAULT_MEETING_EXPORT_PREFS);
    expect(normalizeMeetingExportPrefs({})).toEqual(DEFAULT_MEETING_EXPORT_PREFS);
    expect(normalizeMeetingExportPrefs('garbage')).toEqual(DEFAULT_MEETING_EXPORT_PREFS);
  });

  it('merges partial overrides over the defaults', () => {
    const prefs = normalizeMeetingExportPrefs({ exportType: 'pdf', includeNotes: true, transcribe: true });
    expect(prefs.exportType).toBe('pdf');
    expect(prefs.includeNotes).toBe(true);
    expect(prefs.transcribe).toBe(true);
    expect(prefs.pdfQuality).toBe(DEFAULT_MEETING_EXPORT_PREFS.pdfQuality);
    expect(prefs.includeObservations).toBe(true);
    expect(prefs.includePhotos).toBe(true);
  });

  it('falls back to defaults for unknown enums', () => {
    expect(normalizeMeetingExportPrefs({ exportType: 'zip' }).exportType).toBe('both');
    expect(normalizeMeetingExportPrefs({ exportType: 7 }).exportType).toBe('both');
    expect(normalizeMeetingExportPrefs({ pdfQuality: 'maximum' }).pdfQuality).toBe('standard');
  });

  it('falls back to defaults for non-boolean fields', () => {
    const prefs = normalizeMeetingExportPrefs({ includePhotos: 'yes', includeAudio: 1, includeActions: false });
    expect(prefs.includePhotos).toBe(true);
    expect(prefs.includeAudio).toBe(true);
    expect(prefs.includeActions).toBe(false);
  });

  it('is idempotent', () => {
    const once = normalizeMeetingExportPrefs({ exportType: 'evidence_package' });
    expect(normalizeMeetingExportPrefs(once)).toEqual(once);
  });
});

describe('serializeMeetingExportPrefs', () => {
  it('round-trips through normalize', () => {
    const next = { ...DEFAULT_MEETING_EXPORT_PREFS, exportType: 'pdf' as const };
    expect(normalizeMeetingExportPrefs(serializeMeetingExportPrefs(next))).toEqual(next);
  });
});