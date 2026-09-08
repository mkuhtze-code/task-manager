import type { MeetingExportPreferences, MeetingExportType, MeetingPdfQuality } from './types';

// ── Export preferences ───────────────────────────────────────────────
// The defaults every export flow starts from. User choices live in
// user_settings.meeting_export_prefs (JSONB) and merge over these, so a
// partial/unknown setting can never break the flow.
export const DEFAULT_MEETING_EXPORT_PREFS: MeetingExportPreferences = {
  exportType: 'both',
  includeParticipants: true,
  includeObservations: true,
  includeDecisions: true,
  includeActions: true,
  includeNotes: false,
  includePhotos: true,
  includeAudio: true,
  transcribe: false,
  pdfQuality: 'standard',
};

const EXPORT_TYPES: MeetingExportType[] = ['pdf', 'evidence_package', 'both'];
const PDF_QUALITIES: MeetingPdfQuality[] = ['standard', 'compact', 'keep_quality'];

function isIn<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

// Coerce whatever came back from JSONB (or local storage) into a valid,
// complete preferences object. Unknown values fall back to defaults rather
// than erroring, so a stale/corrupt blob is harmless.
export function normalizeMeetingExportPrefs(raw: unknown): MeetingExportPreferences {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
  return {
    exportType: isIn(src.exportType, EXPORT_TYPES) ? src.exportType : DEFAULT_MEETING_EXPORT_PREFS.exportType,
    includeParticipants: pick(src.includeParticipants, DEFAULT_MEETING_EXPORT_PREFS.includeParticipants),
    includeObservations: pick(src.includeObservations, DEFAULT_MEETING_EXPORT_PREFS.includeObservations),
    includeDecisions: pick(src.includeDecisions, DEFAULT_MEETING_EXPORT_PREFS.includeDecisions),
    includeActions: pick(src.includeActions, DEFAULT_MEETING_EXPORT_PREFS.includeActions),
    includeNotes: pick(src.includeNotes, DEFAULT_MEETING_EXPORT_PREFS.includeNotes),
    includePhotos: pick(src.includePhotos, DEFAULT_MEETING_EXPORT_PREFS.includePhotos),
    includeAudio: pick(src.includeAudio, DEFAULT_MEETING_EXPORT_PREFS.includeAudio),
    transcribe: pick(src.transcribe, DEFAULT_MEETING_EXPORT_PREFS.transcribe),
    pdfQuality: isIn(src.pdfQuality, PDF_QUALITIES) ? src.pdfQuality : DEFAULT_MEETING_EXPORT_PREFS.pdfQuality,
  };
}

export function serializeMeetingExportPrefs(prefs: MeetingExportPreferences): Record<string, unknown> {
  return { ...prefs };
}