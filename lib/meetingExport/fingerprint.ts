import type {
  MeetingExportContent,
  MeetingExportCounts,
  MeetingExportMask,
  MeetingExportRecord,
} from './types';

// ── Fingerprinting + change detection ────────────────────────────────
// An export is "current" when the state it covered is byte-identical to the
// state a new export would cover. That comparison must be deterministic and
// independent of the environment, so we fingerprint a CANONICAL serialization
// — sorted keys, stable ordering — of just the sections the last successful
// export covered (its mask). Media bytes never participate; only the
// reference/metadata that identifies them. Same exportable state → same
// fingerprint, so a record whose fingerprint matches the current state is
// still fully current.

// One observation's media participate via their metadata+reference (the idb
// reference IS the identity of the bytes). `local_uri` is included because
// a re-saved piece of evidence is genuinely different evidence.
function canonicalObservation(o: MeetingExportContent['observations'][number]) {
  return {
    text: o.observation.text,
    captured_at: o.observation.captured_at,
    media: o.media
      .map((m) => ({
        media_type: m.media_type,
        local_uri: m.local_uri,
        mime_type: m.mime_type,
        size_bytes: m.size_bytes,
        captured_at: m.captured_at,
      }))
      .sort(compareObjString),
  };
}

function compareOf(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareObjString(a: { [k: string]: unknown }, b: { [k: string]: unknown }): number {
  const ka = String(a.local_uri ?? a.id ?? '');
  const kb = String(b.local_uri ?? b.id ?? '');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export type MeetingExportState = Record<string, unknown>;

// The canonical state of everything the mask covers. Identity (meeting
// title, window, job, location) is always included — those ARE the record's
// identity, and a renamed meeting legitimately changes an export.
export function maskedExportableState(content: MeetingExportContent, mask: MeetingExportMask): MeetingExportState {
  const m = content.meeting;
  return {
    meeting: { text: m.text, start_time: m.start_time, duration_mins: m.duration_mins, job_id: m.job_id, location_text: m.location_text },
    job: content.job ? { id: content.job.id, name: content.job.name } : null,
    participants: mask.participants
      ? content.participants.map((p) => ({ id: p.id, name: p.name })).sort(compareOf)
      : [],
    notes: mask.notes ? content.meeting.notes ?? '' : null,
    observations: mask.observations
      ? content.observations
          .map((o) => ({
            id: o.observation.id,
            ...canonicalObservation(o),
          }))
          .sort((a, b) => (a.captured_at < b.captured_at ? -1 : a.captured_at > b.captured_at ? 1 : compareOf(a, b)))
      : [],
    decisions: mask.decisions ? content.decisions.map((d) => ({ id: d.id, text: d.text })).sort(compareOf) : [],
    actions: mask.actions
      ? content.actions
          .map((a) => ({ id: a.action.id, text: a.action.text, task_id: a.action.task_id, task_text: a.task?.text ?? null }))
          .sort(compareOf)
      : [],
  };
}

// Deterministic canonical JSON: stable key order + stable array order, so
// the same state maps to the exact same string on every platform.
export function canonicalExportableJson(content: MeetingExportContent, mask: MeetingExportMask): string {
  return JSON.stringify(sortKeys(maskedExportableState(content, mask)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// Lightweight, environment-independent 64-bit FNV-1a hash. Deterministic
// everywhere (pure arithmetic — no crypto, no BigInt ordering subtleties).
// Two independent 32-bit passes reduce collision risk for our collision
// surface; same input always yields the same 16-hex value.
function fnv1a(seed: number, str: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fingerprintString(str: string): string {
  const a = fnv1a(0x811c9dc5, str).toString(16).padStart(8, '0');
  const b = fnv1a(0x7f4a7c15, str).toString(16).padStart(8, '0');
  return a + b;
}

export function fingerprintExport(content: MeetingExportContent, mask: MeetingExportMask): string {
  return fingerprintString(canonicalExportableJson(content, mask));
}

// ── Change summary ───────────────────────────────────────────────────
// Plain-language deltas between a stored record and the CURRENT masked
// counts. Returns null when every covered section count is unchanged (the
// caller decides "changed" by comparing fingerprints for edits that don't
// move counts, e.g. rewording an observation).
export function recordingCountChanges(
  record: MeetingExportRecord,
  current: MeetingExportCounts
): string[] {
  const mask = record.selected_sections?.mask;
  if (!mask) return [];
  const parts: string[] = [];
  const push = (key: string, delta: number, noun: string, added: string, removed: string) => {
    if (delta !== 0) {
      const n = Math.abs(delta);
      const word = n === 1 ? noun : noun + 's';
      parts.push(delta > 0 ? `${n} ${word} ${added}` : `${n} ${word} ${removed}`);
    }
  };

  if (mask.participants) push('participants', current.participants - record.participant_count, 'participant', 'added', 'removed');
  if (mask.observations) {
    push('observations', current.observations - record.observation_count, 'observation', 'added', 'removed');
    push('photos', current.photos - record.photo_count, 'photo', 'added', 'removed');
    push('audio', current.audio - record.audio_count, 'voice note', 'added', 'removed');
  }
  if (mask.decisions) push('decisions', current.decisions - record.decision_count, 'decision', 'added', 'removed');
  if (mask.actions) push('actions', current.actions - record.action_count, 'action', 'added', 'removed');
  // A duplicate check guard: 'voice note' + 'added' → "1 voice note added".
  return parts.map((p) => p.replace(/\s+/g, ' ').trim());
}

// The one-bit, displayed judgment for the meeting-level marker: whether the
// current state differs from the last successful export, and (when it does)
// a short human summary of what changed. `currentCounts` is the masked count
// of the CURRENT state (see maskCounts) — passed in so callers can reuse one
// counting pass.
export function exportChangedSince(
  record: MeetingExportRecord | null,
  content: MeetingExportContent,
  currentCounts: MeetingExportCounts
): { changed: boolean; summary: string | null } {
  if (!record || !record.selected_sections || record.status !== 'successful') {
    return { changed: false, summary: null };
  }
  const mask = record.selected_sections.mask;
  // Same fingerprint → the covered state is still identical → not changed.
  if (record.fingerprint !== null && record.fingerprint === fingerprintExport(content, mask)) {
    return { changed: false, summary: null };
  }
  // Anything else means the current state differs from the last export.
  const deltas = recordingCountChanges(record, currentCounts);
  return { changed: true, summary: deltas.length > 0 ? deltas.join(' · ') : 'Meeting updated' };
}