import { describe, expect, it } from 'vitest';
import {
  normalizePersonName,
  personAlreadyAdded,
  buildObservationDraft,
  groupMediaByObservation,
  fmtCapturedAt,
} from '@/lib/meetingCapture';
import type { MeetingMedia, MeetingParticipant } from '@/lib/meetingTypes';

function person(id: string, name: string): MeetingParticipant {
  return {
    id,
    user_id: 'user-1',
    meeting_id: 'm-1',
    name,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function media(id: string, observationId: string | null): MeetingMedia {
  return {
    id,
    user_id: 'user-1',
    meeting_id: 'm-1',
    observation_id: observationId,
    media_type: 'photo',
    local_uri: `blob:${id}`,
    mime_type: 'image/jpeg',
    size_bytes: 100,
    captured_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('normalizePersonName', () => {
  it('trims surrounding whitespace and collapses internal runs', () => {
    expect(normalizePersonName('  John   Smith ')).toBe('John Smith');
  });

  it('rejects empty names', () => {
    expect(normalizePersonName('')).toBeNull();
    expect(normalizePersonName('   ')).toBeNull();
  });
});

describe('personAlreadyAdded', () => {
  const participants = [person('p-1', 'John Smith'), person('p-2', 'Sarah Jones')];

  it('flags an exact match before adding', () => {
    expect(personAlreadyAdded(participants, 'John Smith')).toBe(true);
  });

  it('flags a case/whitespace-insensitive match', () => {
    expect(personAlreadyAdded(participants, '  john  smith ')).toBe(true);
  });

  it('allows a genuinely new name', () => {
    expect(personAlreadyAdded(participants, 'Tim Rivers')).toBe(false);
  });

  it('treats an empty name as nothing to add', () => {
    expect(personAlreadyAdded(participants, '   ')).toBe(true);
  });
});

describe('buildObservationDraft', () => {
  const photo = { mediaType: 'photo' as const, uri: 'blob:p', mime: 'image/jpeg', size: 100 };
  const audio = { mediaType: 'audio' as const, uri: 'blob:a', mime: 'audio/webm', size: 200 };

  it('allows a text-only observation', () => {
    const draft = buildObservationDraft('The flashing needs replacing.', []);
    expect(draft).not.toBeNull();
    expect(draft!.text).toBe('The flashing needs replacing.');
    expect(draft!.media).toEqual([]);
  });

  it('allows a photo-only observation', () => {
    const draft = buildObservationDraft('', [photo]);
    expect(draft).not.toBeNull();
    expect(draft!.text).toBe('');
    expect(draft!.media).toEqual([photo]);
  });

  it('allows a voice-only observation', () => {
    const draft = buildObservationDraft('', [audio]);
    expect(draft).not.toBeNull();
    expect(draft!.media).toEqual([audio]);
  });

  it('allows text + photo', () => {
    const draft = buildObservationDraft('Crack visible.', [photo]);
    expect(draft!.text).toBe('Crack visible.');
    expect(draft!.media).toEqual([photo]);
  });

  it('allows text + voice', () => {
    const draft = buildObservationDraft('Hear the rattle.', [audio]);
    expect(draft!.media).toEqual([audio]);
  });

  it('allows photo + voice', () => {
    const draft = buildObservationDraft('', [photo, audio]);
    expect(draft!.media).toEqual([photo, audio]);
  });

  it('allows text + photo + voice', () => {
    const draft = buildObservationDraft('All of it.', [photo, audio]);
    expect(draft!.text).toBe('All of it.');
    expect(draft!.media).toHaveLength(2);
  });

  it('rejects an empty observation (no text, no media)', () => {
    expect(buildObservationDraft('   ', [])).toBeNull();
  });

  it('trims text while preserving the media list', () => {
    const draft = buildObservationDraft('  note  ', [photo]);
    expect(draft!.text).toBe('note');
  });
});

describe('groupMediaByObservation', () => {
  it('groups existing media rows under their observation', () => {
    const grouped = groupMediaByObservation([media('m1', 'o-1'), media('m2', 'o-1'), media('m3', 'o-2')]);
    expect(grouped.get('o-1')?.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(grouped.get('o-2')?.map((m) => m.id)).toEqual(['m3']);
  });

  it('keeps meeting-level media (no observation_id) out of the observation display', () => {
    const grouped = groupMediaByObservation([media('m1', null)]);
    expect(grouped.size).toBe(0);
  });

  it('handles an empty media list from older meetings', () => {
    expect(groupMediaByObservation([]).size).toBe(0);
  });
});

describe('fmtCapturedAt', () => {
  it('renders a local clock label like a notebook line', () => {
    const iso = new Date(2026, 8, 8, 14, 14).toISOString();
    expect(fmtCapturedAt(iso)).toBe('2:14pm');
  });

  it('collapses on-the-hour to a bare hour', () => {
    const iso = new Date(2026, 8, 8, 14, 0).toISOString();
    expect(fmtCapturedAt(iso)).toBe('2pm');
  });

  it('handles an invalid timestamp silently', () => {
    expect(fmtCapturedAt('garbage')).toBe('');
  });
});