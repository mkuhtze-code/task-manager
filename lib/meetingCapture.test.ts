import { describe, expect, it } from 'vitest';
import {
  normalizePersonName,
  personAlreadyAdded,
  buildObservationDraft,
  groupMediaByObservation,
  fmtCapturedAt,
  photoMedia,
  remainingMedia,
  observationEdit,
  photoAlt,
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
  const photo = { mediaType: 'photo' as const, uri: 'blob:p', mime: 'image/jpeg', size: 100, capturedAt: '2026-01-01T00:00:01.000Z' };
  const audio = { mediaType: 'audio' as const, uri: 'blob:a', mime: 'audio/webm', size: 200, capturedAt: '2026-01-01T00:00:02.000Z' };
  const photo2 = { mediaType: 'photo' as const, uri: 'blob:p2', mime: 'image/jpeg', size: 100, capturedAt: '2026-01-01T00:00:03.000Z' };

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

  it('allows multiple pieces of one evidence type', () => {
    const draft = buildObservationDraft('', [photo, photo2]);
    expect(draft!.media).toHaveLength(2);
  });

  it('preserves the capture sequence of mixed evidence', () => {
    const draft = buildObservationDraft('After the photos.', [photo, audio, photo2]);
    expect(draft!.media.map((m) => m.uri)).toEqual(['blob:p', 'blob:a', 'blob:p2']);
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

  it('never mixes one observation’s media into another', () => {
    const list = [
      { ...media('p1', 'o-1'), media_type: 'photo' as const },
      { ...media('a1', 'o-2'), media_type: 'audio' as const },
      { ...media('p2', 'o-1'), media_type: 'photo' as const },
    ];
    const grouped = groupMediaByObservation(list);
    expect(grouped.get('o-1')?.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(grouped.get('o-2')?.map((m) => m.id)).toEqual(['a1']);
    expect(grouped.get('o-3')).toBeUndefined();
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

describe('photoMedia (the evidence carousel set for one observation)', () => {
  function photo(id: string, obsId: string | null): MeetingMedia {
    return media(id, obsId);
  }
  function audioNote(id: string, obsId: string | null): MeetingMedia {
    return { ...media(id, obsId), media_type: 'audio' };
  }

  it('shows no carousel for an observation with no photos', () => {
    expect(photoMedia([audioNote('a1', 'o-1')])).toEqual([]);
    expect(photoMedia([])).toEqual([]);
  });

  it('keeps a single photo (no unnecessary navigation needed)', () => {
    expect(photoMedia([photo('p1', 'o-1')]).map((m) => m.id)).toEqual(['p1']);
  });

  it('keeps multiple photos in captured order and drops audio', () => {
    const list = [photo('p1', 'o-1'), audioNote('a1', 'o-1'), photo('p2', 'o-1')];
    expect(photoMedia(list).map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('lists every photo attached to one observation and none of another’s', () => {
    const grouped = groupMediaByObservation([
      photo('p1', 'o-1'),
      photo('p2', 'o-1'),
      photo('p3', 'o-2'),
      photo('p4', null),
    ]);
    expect(photoMedia(grouped.get('o-1') ?? []).map((m) => m.id)).toEqual(['p1', 'p2']);
  });
});

describe('remainingMedia / observationEdit', () => {
  function photo(id: string, obsId: string | null): MeetingMedia {
    return media(id, obsId);
  }

  it('removes the requested media rows and keeps the rest', () => {
    const list = [photo('p1', 'o-1'), photo('p2', 'o-1'), photo('p3', 'o-1')];
    expect(remainingMedia(list, ['p2']).map((m) => m.id)).toEqual(['p1', 'p3']);
    expect(remainingMedia(list, []).length).toBe(3);
  });

  it('removes a voice note without touching the photos beside it', () => {
    const list = [
      photo('p1', 'o-1'),
      { ...photo('a1', 'o-1'), media_type: 'audio' as const },
      photo('p2', 'o-1'),
    ];
    const rest = remainingMedia(list, ['a1']);
    expect(rest.map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('keeps editing a text-only observation (legacy data)', () => {
    expect(observationEdit('  Roof flashing damaged.  ', 0)).toBe('Roof flashing damaged.');
    expect(observationEdit('', 0)).toBeNull();
  });

  it('keeps editing a media-only observation with empty text', () => {
    expect(observationEdit('', 2)).toBe('');
  });

  it('trims text into the saved payload', () => {
    expect(observationEdit('  edit  ', 1)).toBe('edit');
  });

  it('blocks a save that would leave an empty observation', () => {
    expect(observationEdit('   ', 0)).toBeNull();
    expect(observationEdit('', remainingMedia([photo('p1', 'o-1')], ['p1']).length)).toBeNull();
  });

  it('allows a save that removes media only when text remains', () => {
    expect(observationEdit('Still evidence.', remainingMedia([photo('p1', 'o-1')], ['p1']).length)).toBe(
      'Still evidence.'
    );
  });
});

describe('photoAlt', () => {
  it('describes position without an observation', () => {
    expect(photoAlt(media('p1', null), 0, 4)).toBe('Photo 1 of 4');
  });

  it('includes the observation text when available', () => {
    expect(photoAlt(media('p1', 'o-1'), 2, 4, 'Roof flashing damaged.')).toBe(
      'Photo 3 of 4 — Roof flashing damaged.'
    );
  });
});