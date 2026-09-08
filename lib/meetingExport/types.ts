import type {
  Meeting,
  MeetingAction,
  MeetingDecision,
  MeetingMedia,
  MeetingObservation,
  MeetingParticipant,
} from '@/lib/meetingTypes';

// ── Meeting Export (V1): core types ───────────────────────────────────
// A Meeting Export is a snapshot of PART of a meeting, delivered as a
// neutral Meeting Record (PDF) and/or an Evidence Package (the original
// media, untouched). What goes in is resolved before generation
// (Preferences → the meeting's actual content → a per-export review that
// never mutates Preferences), generation never changes the meeting or its
// device-local media, and the only thing written to Supabase is immutable
// ExportRecord metadata per attempt.

export type MeetingExportType = 'pdf' | 'evidence_package' | 'both';

export type MeetingPdfQuality = 'standard' | 'compact' | 'keep_quality';

export type MeetingExportStatus = 'generating' | 'successful' | 'failed';

export type MeetingTranscriptStatus = 'not_requested' | 'requested' | 'completed' | 'failed';

// ── Preferences (persistent, per-user) ───────────────────────────────
// Stored as a JSONB blob on user_settings.meeting_export_prefs and always
// merged over defaults, so an unknown key or a partial row never breaks the
// export flow. Choices here are the DEFAULTS the review starts from.
export type MeetingExportPreferences = {
  exportType: MeetingExportType;
  includeParticipants: boolean;
  includeObservations: boolean;
  includeDecisions: boolean;
  includeActions: boolean;
  // The raw-capture Notes field (source evidence, deliberately unstructured).
  includeNotes: boolean;
  includePhotos: boolean;
  includeAudio: boolean;
  transcribe: boolean;
  pdfQuality: MeetingPdfQuality;
};

// ── Exportable content ────────────────────────────────────────────────
// Everything about a meeting an export might include. Media references are
// the device-local idb:// refs the meeting rows already carry; the engine
// resolves bytes only for what ends up selected in the final plan.
export type MeetingExportContent = {
  meeting: Meeting;
  job: { id: string; name: string } | null;
  participants: MeetingParticipant[];
  observations: MeetingExportObservation[];
  decisions: MeetingDecision[];
  actions: MeetingExportActionContent[];
};

export type MeetingExportObservation = {
  observation: MeetingObservation;
  media: MeetingMedia[];
};

// An action plus the text of the task it is linked to (a promised-out
// action is ONE underlying task — the link is what the record states).
export type MeetingExportActionContent = {
  action: MeetingAction;
  task: { id: string; text: string } | null;
};

// ── Final plan (resolved selection for ONE export) ───────────────────
// Derived purely from Preferences + content + review overrides. Nothing in
// here is ever written back into Preferences.
export type MeetingExportPlan = {
  exportType: MeetingExportType;
  transcribe: boolean;
  pdfQuality: MeetingPdfQuality;
  includeParticipants: boolean;
  includeNotes: boolean;
  // Selected observations in recorded (captured_at) order; their media in
  // capture order. An observation's ordinal for "Obs. N" numbering and the
  // evidence-package filenames is its 1-based index here.
  observations: MeetingExportObservationSelection[];
  decisions: string[];
  actions: string[];
  // A section explicitly selected while the meeting holds NO content for it
  // (e.g. Decisions was added with nothing recorded). Renders as
  // "None recorded" and participates in the fingerprint mask.
  explicitEmpty: MeetingExportExplicitEmpty;
};

export type MeetingExportObservationSelection = {
  id: string;
  mediaIds: string[];
};

export type MeetingExportExplicitEmpty = {
  observations: boolean;
  decisions: boolean;
  actions: boolean;
};

// Sections an export covered — the mask used for change detection. A
// covered section means the export showed SOME of it; changes to a covered
// section after an export mark the record as changed.
export type MeetingExportMask = {
  participants: boolean;
  notes: boolean;
  observations: boolean;
  decisions: boolean;
  actions: boolean;
};

// The stored selection snapshot (selected_sections jsonb): enough to
// reproduce the review context of one attempt and drive change detection.
export type MeetingExportSections = {
  mask: MeetingExportMask;
  includeParticipants: boolean;
  includeNotes: boolean;
  observationIds: string[];
  mediaIds: string[];
  decisionIds: string[];
  actionIds: string[];
};

export type MeetingExportCounts = {
  observations: number;
  photos: number;
  audio: number;
  decisions: number;
  actions: number;
  participants: number;
};

// ── ExportRecord (the metadata row) ───────────────────────────────────
export type MeetingExportRecord = {
  id: string;
  user_id: string;
  meeting_id: string;
  status: MeetingExportStatus;
  export_type: MeetingExportType;
  fingerprint: string | null;
  selected_sections: MeetingExportSections | null;
  observation_count: number;
  photo_count: number;
  audio_count: number;
  decision_count: number;
  action_count: number;
  participant_count: number;
  transcription_requested: boolean;
  transcription_status: MeetingTranscriptStatus;
  missing_media_count: number;
  file_size: number | null;
  error_reason: string | null;
  created_at: string;
};

export type MissingMediaNotice = {
  mediaId: string;
  observationId: string | null;
  label: string;
};