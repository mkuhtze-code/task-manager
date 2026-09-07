import { describe, expect, it } from 'vitest';
import {
  canonicalExportableJson,
  exportChangedSince,
  fingerprintExport,
  fingerprintString,
  recordingCountChanges,
} from '@/lib/meetingExport/fingerprint';
import { maskCounts } from '@/lib/meetingExport/plan';
import { fullSections, makeContent, makeMask, makeMedia, makeObservation, makeRecord } from './fixtures';
import type { MeetingExportCounts } from '@/lib/meetingExport';

const fullCounts: MeetingExportCounts = {
  observations: 2,
  photos: 2,
  audio: 1,
  decisions: 1,
  actions: 1,
  participants: 2,
};

describe('fingerprintExport', () => {
  it('is deterministic for identical state', () => {
    const content = makeContent();
    const mask = makeMask();
    expect(fingerprintExport(content, mask)).toBe(fingerprintExport(content, mask));
    expect(canonicalExportableJson(content, mask)).toBe(canonicalExportableJson(content, mask));
  });

  it('changes when a covered observation changes', () => {
    const base = makeContent();
    const mask = makeMask();
    const changed = makeContent({
      observations: [
        { observation: makeObservation('obs-1', { text: 'Reworded observation' }), media: base.observations[0].media },
        base.observations[1],
      ],
    });
    expect(fingerprintExport(changed, mask)).not.toBe(fingerprintExport(base, mask));
  });

  it('changes when an observation is added', () => {
    const base = makeContent();
    const mask = makeMask();
    const grown = makeContent({
      observations: [...base.observations, { observation: makeObservation('obs-9'), media: [] }],
    });
    expect(fingerprintExport(grown, mask)).not.toBe(fingerprintExport(base, mask));
  });

  it('changes when media is added to an observation', () => {
    const base = makeContent();
    const mask = makeMask();
    const grown = makeContent({
      observations: [
        { observation: makeObservation('obs-1'), media: [...base.observations[0].media, makeMedia('media-9', 'obs-1', 'photo')] },
        base.observations[1],
      ],
    });
    expect(fingerprintExport(grown, mask)).not.toBe(fingerprintExport(base, mask));
  });

  it('does not change for sections the mask does not cover', () => {
    const base = makeContent();
    const changed = makeContent({
      decisions: [{ id: 'dec-9', user_id: 'u', meeting_id: 'm', text: 'A brand new decision', created_at: '' }],
      actions: [{ action: { id: 'act-9', user_id: 'u', meeting_id: 'm', text: 'x', created_at: '', task_id: null }, task: null }],
    });
    const mask = makeMask({ decisions: false, actions: false });
    expect(fingerprintExport(changed, mask)).toBe(fingerprintExport(base, mask));
  });

  it('does not change when uncovered observations are added', () => {
    const base = makeContent();
    const changed = makeContent({
      observations: [...base.observations, { observation: makeObservation('obs-9'), media: [makeMedia('media-9', 'obs-9', 'photo')] }],
    });
    expect(fingerprintExport(changed, makeMask({ observations: false }))).toBe(fingerprintExport(base, makeMask({ observations: false })));
  });

  it('produces a stable 16-hex string', () => {
    expect(fingerprintString('x')).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintString('x')).toBe(fingerprintString('x'));
  });
});

describe('exportChangedSince', () => {
  it('reports not changed when the fingerprint still matches', () => {
    const content = makeContent();
    const mask = makeMask();
    const record = makeRecord({ id: 'rec-x' }, fingerprintExport(content, mask), fullSections());
    const counts = maskCounts(content, fullSections().mask);
    expect(exportChangedSince(record, content, counts)).toEqual({ changed: false, summary: null });
  });

  it('reports changed with a count summary when observations grew', () => {
    const base = makeContent();
    const mask = makeMask();
    const record = makeRecord({ id: 'rec-x' }, fingerprintExport(base, mask), fullSections());
    const grown = makeContent({
      observations: [...base.observations, { observation: makeObservation('obs-9'), media: [] }],
    });
    const counts = maskCounts(grown, mask);
    const result = exportChangedSince(record, grown, counts);
    expect(result.changed).toBe(true);
    expect(result.summary).toContain('1 observation added');
  });

  it('reports changed with "Meeting updated" when only text changed (counts equal)', () => {
    const base = makeContent();
    const mask = makeMask();
    const record = makeRecord({ id: 'rec-x' }, fingerprintExport(base, mask), fullSections());
    const edited = makeContent({
      observations: [
        { observation: makeObservation('obs-1', { text: 'Completely rewritten observation' }), media: base.observations[0].media },
        base.observations[1],
      ],
    });
    const counts = maskCounts(edited, mask);
    expect(exportChangedSince(record, edited, counts)).toEqual({ changed: true, summary: 'Meeting updated' });
  });

  it('reports not changed for a null or non-successful record', () => {
    expect(exportChangedSince(null, makeContent(), fullCounts)).toEqual({ changed: false, summary: null });
    expect(exportChangedSince(makeRecord({ id: 'r', status: 'failed' }, null, null), makeContent(), fullCounts)).toEqual({
      changed: false,
      summary: null,
    });
  });

  it('reports changed once a fingerprint mismatch appears', () => {
    const content = makeContent();
    const record = makeRecord({ id: 'rec-x' }, 'stale-fingerprint', fullSections());
    const counts = maskCounts(content, fullSections().mask);
    expect(exportChangedSince(record, content, counts).changed).toBe(true);
  });
});

describe('recordingCountChanges', () => {
  it('builds singular/plural deltas', () => {
    const record = makeRecord({
      observation_count: 2,
      photo_count: 2,
      audio_count: 1,
      decision_count: 1,
      action_count: 1,
      participant_count: 2,
    });
    const current = { observations: 3, photos: 4, audio: 0, decisions: 1, actions: 2, participants: 2 };
    const parts = recordingCountChanges(record, current);
    expect(parts).toContain('1 observation added');
    expect(parts).toContain('2 photos added');
    expect(parts).toContain('1 voice note removed');
    expect(parts).toContain('1 action added');
    expect(parts).not.toContain(expect.stringContaining('participant'));
  });

  it('returns no parts when covered counts are equal', () => {
    const record = makeRecord({
      observation_count: 2,
      photo_count: 2,
      audio_count: 1,
      decision_count: 1,
      action_count: 1,
      participant_count: 2,
    });
    expect(recordingCountChanges(record, { ...fullCounts })).toEqual([]);
  });

  it('skips sections the record did not cover', () => {
    const record = makeRecord(
      { observation_count: 99, photo_count: 99, audio_count: 99, decision_count: 1, action_count: 99, participant_count: 2 },
      'fp',
      { ...fullSections(), mask: { participants: true, notes: false, observations: false, decisions: true, actions: false } }
    );
    const parts = recordingCountChanges(record, { observations: 99, photos: 99, audio: 99, decisions: 2, actions: 99, participants: 3 });
    expect(parts).toEqual(['1 participant added', '1 decision added']);
  });
});