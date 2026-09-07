import type {
  MeetingExportContent,
  MeetingExportCounts,
  MeetingExportMask,
  MeetingExportPlan,
  MeetingExportSections,
} from './types';
import { normalizeMeetingExportPrefs } from './preferences';
import type { MeetingExportPreferences } from './types';
import type { MeetingExportRecord } from './types';

// ── Export plan resolution ────────────────────────────────────────────
// What an export actually contains is resolved in strict order:
//   Preferences (defaults the review starts from)
//   → the meeting's actual content (content that doesn't exist can't be
//     selected; empty sections can be explicitly selected → "None recorded")
//   → review overrides (applied per export, never written back to
//     Preferences).
// This file is pure so the resolution is deterministic and tested.

export type MeetingExportReviewItem = {
  id: string;
  text: string;
  selected: boolean;
};

export type MeetingExportReviewMedia = {
  id: string;
  mediaType: string;
  selected: boolean;
};

export type MeetingExportReviewObservation = {
  id: string;
  text: string;
  capturedAt: string;
  selected: boolean;
  media: MeetingExportReviewMedia[];
};

export type MeetingExportReviewState = {
  exportType: MeetingExportPlan['exportType'];
  transcribe: boolean;
  pdfQuality: MeetingExportPlan['pdfQuality'];
  participants: boolean;
  notes: boolean;
  observationsOn: boolean;
  observations: MeetingExportReviewObservation[];
  decisionsOn: boolean;
  decisions: MeetingExportReviewItem[];
  actionsOn: boolean;
  actions: MeetingExportReviewItem[];
};

const EXPORTABLE_MEDIA = ['photo', 'audio'];

function mediaDefaultOn(m: { media_type: string }, prefs: MeetingExportPreferences): boolean {
  if (m.media_type === 'photo') return prefs.includePhotos;
  if (m.media_type === 'audio') return prefs.includeAudio;
  return false;
}

// Preferences applied to what the meeting actually holds. Media kept here are
// photos/audio only — anything else isn't exportable in V1.
export function defaultReviewState(content: MeetingExportContent, rawPrefs: unknown): MeetingExportReviewState {
  const prefs = normalizeMeetingExportPrefs(rawPrefs);
  const participants = prefs.includeParticipants && content.participants.length > 0;
  const notes = prefs.includeNotes && Boolean(content.meeting.notes?.trim());
  const observationsOn = prefs.includeObservations && content.observations.length > 0;
  const decisionsOn = prefs.includeDecisions && content.decisions.length > 0;
  const actionsOn = prefs.includeActions && content.actions.length > 0;

  return {
    exportType: prefs.exportType,
    transcribe: prefs.transcribe,
    pdfQuality: prefs.pdfQuality,
    participants,
    notes,
    observationsOn,
    observations: content.observations.map((obs) => {
      const media = obs.media.filter((m) => EXPORTABLE_MEDIA.includes(m.media_type));
      return {
        id: obs.observation.id,
        text: obs.observation.text,
        capturedAt: obs.observation.captured_at,
        selected: observationsOn,
        media: media.map((m) => ({
          id: m.id,
          mediaType: m.media_type,
          selected: observationsOn && mediaDefaultOn(m, prefs),
        })),
      };
    }),
    decisionsOn,
    decisions: content.decisions.map((d) => ({ id: d.id, text: d.text, selected: decisionsOn })),
    actionsOn,
    actions: content.actions.map((a) => ({ id: a.action.id, text: a.action.text, selected: actionsOn })),
  };
}

// Rebuild a review state from a stored selection snapshot (selected_sections)
// — the "previous selections as starting context" contract for retrying a
// failed export. Section flags and the exact ids are restored; anything else
// (type, transcription, pdf size) comes from Preferences, because a half-made
// attempt left no record of them.
export function seedReviewFromSections(
  content: MeetingExportContent,
  rawPrefs: unknown,
  sections: MeetingExportSections | null
): MeetingExportReviewState {
  const state = defaultReviewState(content, rawPrefs);
  if (!sections) return state;

  const observationIds = new Set(sections.observationIds);
  const mediaIds = new Set(sections.mediaIds);
  const decisionIds = new Set(sections.decisionIds);
  const actionIds = new Set(sections.actionIds);

  state.participants = sections.includeParticipants;
  state.notes = sections.includeNotes;
  state.observationsOn = sections.mask.observations;
  for (const obs of state.observations) {
    obs.selected = state.observationsOn && observationIds.has(obs.id);
    for (const m of obs.media) m.selected = obs.selected && mediaIds.has(m.id);
  }
  state.decisionsOn = sections.mask.decisions;
  for (const d of state.decisions) d.selected = state.decisionsOn && decisionIds.has(d.id);
  state.actionsOn = sections.mask.actions;
  for (const a of state.actions) a.selected = state.actionsOn && actionIds.has(a.id);
  return state;
}

// Seed the review with the exact previous attempt of a FAILED export.
export function seedReviewFromRecord(
  content: MeetingExportContent,
  rawPrefs: unknown,
  record: MeetingExportRecord | null
): MeetingExportReviewState {
  const state = seedReviewFromSections(content, rawPrefs, record?.selected_sections ?? null);
  if (record) {
    state.exportType = record.export_type;
    state.transcribe = record.transcription_requested;
  }
  return state;
}

// Turn a (possibly review-adjusted) state into the final plan for
// generation. `observationsOn` etc. stay stored on the state, so toggling a
// whole section off then back on never loses the item-level choices inside.
export function resolvePlanFromReview(content: MeetingExportContent, state: MeetingExportReviewState): MeetingExportPlan {
  const hasObservations = content.observations.length > 0;
  const hasDecisions = content.decisions.length > 0;
  const hasActions = content.actions.length > 0;

  return {
    exportType: state.exportType,
    transcribe: state.transcribe,
    pdfQuality: state.pdfQuality,
    includeParticipants: state.participants,
    includeNotes: state.notes,
    observations: state.observationsOn
      ? state.observations
          .filter((o) => o.selected)
          .map((o) => ({ id: o.id, mediaIds: o.media.filter((m) => m.selected).map((m) => m.id) }))
      : [],
    decisions: state.decisionsOn ? state.decisions.filter((d) => d.selected).map((d) => d.id) : [],
    actions: state.actionsOn ? state.actions.filter((a) => a.selected).map((a) => a.id) : [],
    explicitEmpty: {
      observations: state.observationsOn && !hasObservations,
      decisions: state.decisionsOn && !hasDecisions,
      actions: state.actionsOn && !hasActions,
    },
  };
}

// "Obs. N" numbering and the evidence-package filenames both depend on the
// observation's position in the plan (recorded order, 1-based).
export function observationOrdinals(plan: MeetingExportPlan): Map<string, number> {
  const ordinals = new Map<string, number>();
  plan.observations.forEach((sel, i) => ordinals.set(sel.id, i + 1));
  return ordinals;
}

// The section mask the fingerprint + change detection use for an export.
// A section is covered when the final plan actually held (or explicitly
// requested) content for it.
export function maskFromPlan(content: MeetingExportContent, plan: MeetingExportPlan): MeetingExportMask {
  return {
    participants: plan.includeParticipants,
    notes: plan.includeNotes,
    observations: plan.observations.length > 0 || plan.explicitEmpty.observations,
    decisions: plan.decisions.length > 0 || plan.explicitEmpty.decisions,
    actions: plan.actions.length > 0 || plan.explicitEmpty.actions,
  };
}

export function sectionsFromPlan(content: MeetingExportContent, plan: MeetingExportPlan): MeetingExportSections {
  return {
    mask: maskFromPlan(content, plan),
    includeParticipants: plan.includeParticipants,
    includeNotes: plan.includeNotes,
    observationIds: plan.observations.map((o) => o.id),
    mediaIds: plan.observations.flatMap((o) => o.mediaIds),
    decisionIds: plan.decisions,
    actionIds: plan.actions,
  };
}

// What this export holds. Counts describe what WAS exported (never what a
// section might have held), so they can be compared against the stored
// record for the change summary.
export function planCounts(content: MeetingExportContent, plan: MeetingExportPlan): MeetingExportCounts {
  let photos = 0;
  let audio = 0;
  for (const sel of plan.observations) {
    const obs = content.observations.find((o) => o.observation.id === sel.id);
    if (!obs) continue;
    const selected = new Set(sel.mediaIds);
    for (const m of obs.media) {
      if (!selected.has(m.id)) continue;
      if (m.media_type === 'photo') photos += 1;
      else if (m.media_type === 'audio') audio += 1;
    }
  }
  return {
    observations: plan.observations.length,
    photos,
    audio,
    decisions: plan.decisions.length,
    actions: plan.actions.length,
    participants: plan.includeParticipants ? content.participants.length : 0,
  };
}

// Same shape as planCounts, but computed against a stored mask for the
// CURRENT content — what the export would count if nothing changed for the
// sections it covered. Used by the change-detection marker.
export function maskCounts(content: MeetingExportContent, mask: MeetingExportMask): MeetingExportCounts {
  let photos = 0;
  let audio = 0;
  if (mask.observations) {
    for (const obs of content.observations) {
      for (const m of obs.media) {
        if (m.media_type === 'photo') photos += 1;
        else if (m.media_type === 'audio') audio += 1;
      }
    }
  }
  return {
    observations: mask.observations ? content.observations.length : 0,
    photos,
    audio,
    decisions: mask.decisions ? content.decisions.length : 0,
    actions: mask.actions ? content.actions.length : 0,
    participants: mask.participants ? content.participants.length : 0,
  };
}