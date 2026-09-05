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

// ── V2.1: photo galleries + in-place observation edits ─────────────
// Pure helpers for the meeting photo gallery and for editing saved
// observations. Media stays the same device-local meeting_media[] the page
// loads — nothing here touches persistence or storage.

// Every photo row in the list: those inside observations and orphans alike.
export function photoMedia(media: MeetingMedia[]): MeetingMedia[] {
  return media.filter((m) => m.media_type === 'photo');
}

// Defensive no-duplicates guarantee for aggregate views (a gallery must
// never show the same row twice, even if the underlying list ever did).
export function uniqueMedia(media: MeetingMedia[]): MeetingMedia[] {
  const seen = new Set<string>();
  const out: MeetingMedia[] = [];
  for (const m of media) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

// All of the meeting's photos, deduplicated, in load order — whether they
// belong to an observation or stand alone as meeting-level media. The
// observation relationship is never rewritten: orphan photos stay visible
// here without being silently attached to an observation.
export function meetingPhotos(media: MeetingMedia[]): MeetingMedia[] {
  return uniqueMedia(photoMedia(media));
}

// Media left after an explicit removal list is applied. The count decides
// whether an observation still holds evidence after an edit.
export function remainingMedia(media: MeetingMedia[], removeIds: string[]): MeetingMedia[] {
  const removed = new Set(removeIds);
  return media.filter((m) => !removed.has(m.id));
}

// Edits follow the same "at least one input" rule as new observations:
// a trimmed text when the observation keeps some evidence, null when text
// AND every media row would be gone (nothing left to save).
export function observationEdit(text: string, remainingCount: number): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 && remainingCount === 0) return null;
  return trimmed;
}

// Meaningful alt/description text for a gallery photo: its position plus
// the observation it belongs to, when there is one.
export function photoAlt(
  photo: MeetingMedia,
  index: number,
  total: number,
  observationText?: string | null
): string {
  const base = `Photo ${index + 1} of ${total}`;
  const text = observationText?.trim();
  return text ? `${base} — ${text}` : base;
}