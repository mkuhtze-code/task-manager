import type { MeetingMedia, MeetingMediaType, MeetingParticipant } from '@/lib/meetingTypes';

// ── Pure capture/people logic ─────────────────────────────────────────
// Kept out of the components so the behaviour is deterministic and tested:
// name normalisation + quiet de-duplication for People, and the rule that
// an observation must contain at least ONE input (text and/or media) but
// never more than it needs. Media stays a device-local reference (blob URL
// in V1) — nothing here uploads bytes.

export type CapturedMedia = {
  mediaType: MeetingMediaType;
  uri: string;
  mime: string | null;
  size: number | null;
};

// Participants are freeform names; there is no Person entity. Normalise so
// "John  Smith" and " john smith " collapse to the same sensible name, and
// return null when there is nothing to save.
export function normalizePersonName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length > 0 ? name : null;
}

// Quiet duplicate handling: case-insensitive compare after the same
// normalisation the insert uses, so re-tapping the same simple name adds
// nothing instead of creating a look-alike row.
export function personAlreadyAdded(participants: MeetingParticipant[], raw: string): boolean {
  const name = normalizePersonName(raw);
  if (!name) return true;
  const lower = name.toLowerCase();
  return participants.some((p) => p.name.toLowerCase() === lower);
}

export type ObservationDraft = {
  text: string;
  media: CapturedMedia[];
};

// An observation is ONE piece of evidence: text, photo, voice or any
// combination — all optional, but at least one present. Returns null when
// the draft is empty so nothing can be saved with no content at all.
export function buildObservationDraft(text: string, media: CapturedMedia[]): ObservationDraft | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 && media.length === 0) return null;
  return { text: trimmed, media };
}

// Media rows attach back to their observation via observation_id. Grouped
// so existing/loaded rows (old or new) render under the right observation;
// media without an observation_id (attached straight to the meeting) stays
// out of the observation display.
export function groupMediaByObservation(media: MeetingMedia[]): Map<string, MeetingMedia[]> {
  const grouped = new Map<string, MeetingMedia[]>();
  for (const m of media) {
    if (!m.observation_id) continue;
    const list = grouped.get(m.observation_id);
    if (list) list.push(m);
    else grouped.set(m.observation_id, [m]);
  }
  return grouped;
}

// Short local "Captured 2:14pm" label — observation rows read like a
// notebook line, not a table cell.
export function fmtCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  if (minutes === 0) return `${hours}${ampm}`;
  return `${hours}:${String(minutes).padStart(2, '0')}${ampm}`;
}