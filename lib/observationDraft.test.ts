import { describe, expect, it } from 'vitest';
import type { CapturedMedia } from '@/lib/meetingCapture';
import {
  observationDraftReducer,
  closedObservationDraft,
  hasDraftContent,
  observationDraftKey,
  saveObservationDraft,
  loadObservationDraft,
  clearObservationDraft,
  createMemoryDraftStorage,
  type ObservationDraftState,
  type ObservationDraftAction,
} from '@/lib/observationDraft';

function photo(i: number, name = 'p'): CapturedMedia {
  return {
    mediaType: 'photo',
    uri: `idb://${name}-${i}`,
    mime: 'image/jpeg',
    size: 10,
    capturedAt: `2026-06-01T00:00:0${i}.000Z`,
  };
}

function voice(): CapturedMedia {
  return {
    mediaType: 'audio',
    uri: 'idb://voice-1',
    mime: 'audio/webm',
    size: 20,
    capturedAt: '2026-06-01T00:01:00.000Z',
  };
}

function run(initial: ObservationDraftState, ...actions: ObservationDraftAction[]): ObservationDraftState {
  return actions.reduce(observationDraftReducer, initial);
}

describe('observation draft lifecycle: the capture surface CONFIRMS', () => {
  it('begins closed and only opens on an explicit begin', () => {
    expect(closedObservationDraft()).toEqual({ phase: 'closed', text: '', media: [] });
    const open = run(closedObservationDraft(), { type: 'begin' });
    expect(open.phase).toBe('open');
    expect(open.text).toBe('');
    expect(open.media).toEqual([]);
  });

  it('Test A: taking a photo does NOT close the draft', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'Saw the demo fail.' },
      { type: 'addMedia', media: photo(1) }
    );
    expect(s.phase).toBe('open');
    expect(s.text).toBe('Saw the demo fail.');
    expect(s.media).toHaveLength(1);
  });

  it('three photos accumulate into the SAME open draft, in capture order', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'addMedia', media: photo(1) },
      { type: 'addMedia', media: photo(2) },
      { type: 'addMedia', media: photo(3) }
    );
    expect(s.phase).toBe('open');
    expect(s.media.map((m) => m.uri)).toEqual(['idb://p-1', 'idb://p-2', 'idb://p-3']);
  });

  it('Test B: the draft resumes with its text and earlier photos after the picker returns', () => {
    // "Return from picker" is a no-op in the model: no action fires. The
    // draft simply continues to exist in the same state.
    const open = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'notes that must survive' },
      { type: 'addMedia', media: photo(1) }
    );
    expect(open.phase).toBe('open');
    expect(open.text).toBe('notes that must survive');
    expect(open.media).toHaveLength(1);
  });

  it('Test C: a cancelled picker (return with nothing) is a no-op, not a close', () => {
    const open = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'still here' }
    );
    // Nothing dispatched — exactly what the components do on an empty
    // change event — so the draft is untouched.
    expect(open.phase).toBe('open');
    expect(open.text).toBe('still here');
    expect(open.media).toEqual([]);
  });

  it('Test D: text survives photo capture; photos survive text edits', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'addMedia', media: photo(1) },
      { type: 'addMedia', media: photo(2) },
      { type: 'setText', text: 'typed after photos' }
    );
    expect(s.phase).toBe('open');
    expect(s.text).toBe('typed after photos');
    expect(s.media).toHaveLength(2);
  });

  it('Test E: photo-only, text-only and voice-only drafts are all savable content', () => {
    const empty = run(closedObservationDraft(), { type: 'begin' });
    expect(hasDraftContent(empty)).toBe(false);

    const photoOnly = run(closedObservationDraft(), { type: 'begin' }, { type: 'addMedia', media: photo(1) });
    expect(hasDraftContent(photoOnly)).toBe(true);

    const textOnly = run(closedObservationDraft(), { type: 'begin' }, { type: 'setText', text: '  ' });
    expect(hasDraftContent(textOnly)).toBe(false);
    const realText = run(closedObservationDraft(), { type: 'begin' }, { type: 'setText', text: 'x' });
    expect(hasDraftContent(realText)).toBe(true);

    const voiceOnly = run(closedObservationDraft(), { type: 'begin' }, { type: 'addMedia', media: voice() });
    expect(hasDraftContent(voiceOnly)).toBe(true);
  });

  it('append order across photo + voice is preserved', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'addMedia', media: photo(1) },
      { type: 'addMedia', media: voice() },
      { type: 'addMedia', media: photo(2) }
    );
    expect(s.media.map((m) => m.mediaType)).toEqual(['photo', 'audio', 'photo']);
  });

  it('removeMedia removes exactly that index and does not close the draft', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'addMedia', media: photo(1) },
      { type: 'addMedia', media: photo(2) },
      { type: 'addMedia', media: photo(3) },
      { type: 'removeMedia', index: 1 }
    );
    expect(s.phase).toBe('open');
    expect(s.media.map((m) => m.uri)).toEqual(['idb://p-1', 'idb://p-3']);
  });

  it('removing the final photo leaves an open text-only draft', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'notes' },
      { type: 'addMedia', media: photo(1) },
      { type: 'removeMedia', index: 0 }
    );
    expect(s.phase).toBe('open');
    expect(s.media).toEqual([]);
    expect(s.text).toBe('notes');
  });

  it('complete (save succeeded) is the only close on save', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'saved' },
      { type: 'complete' }
    );
    expect(s).toEqual(closedObservationDraft());
  });

  it('Test F/G complement: discard (explicit cancel) is the ONLY path that throws the draft away', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'abandoned' },
      { type: 'addMedia', media: photo(1) },
      { type: 'discard' }
    );
    expect(s).toEqual(closedObservationDraft());
  });

  it('no action other than discard/complete can close an open draft', () => {
    for (const action of [
      { type: 'setText', text: '' },
      { type: 'removeMedia', index: 0 },
    ] as ObservationDraftAction[]) {
      const s = run(closedObservationDraft(), { type: 'begin' }, { type: 'addMedia', media: photo(1) }, action);
      expect(s.phase).toBe('open');
    }
  });

  it('closed drafts ignore setText/addMedia (defensive no-ops)', () => {
    const s = run(
      closedObservationDraft(),
      { type: 'setText', text: 'should not stick' },
      { type: 'addMedia', media: photo(1) }
    );
    expect(s).toEqual(closedObservationDraft());
  });
});

describe('observation draft storage mirror', () => {
  it('a reload round-trips the exact same open draft (text + idb refs)', () => {
    const storage = createMemoryDraftStorage();
    const open = run(
      closedObservationDraft(),
      { type: 'begin' },
      { type: 'setText', text: 'survives reload' },
      { type: 'addMedia', media: photo(1) },
      { type: 'addMedia', media: photo(2) }
    );
    saveObservationDraft(storage, 'm-1', open);
    const restored = loadObservationDraft(storage, 'm-1');
    expect(restored).toEqual({
      phase: 'open',
      text: 'survives reload',
      media: [photo(1), photo(2)],
    });
    // Rehydrating then continuing capture keeps the draft open with prior
    // media present — the WebView-recreation recovery path.
    const resumed = run(restored!, { type: 'addMedia', media: voice() });
    expect(resumed.phase).toBe('open');
    expect(resumed.media).toHaveLength(3);
  });

  it('the durable mirror strips the transient blob before writing', () => {
    const storage = createMemoryDraftStorage();
    const withBlob: CapturedMedia = { ...photo(3), blob: new Blob(['x'], { type: 'image/jpeg' }) };
    const open = run(closedObservationDraft(), { type: 'begin' }, { type: 'addMedia', media: withBlob });
    saveObservationDraft(storage, 'm-1', open);
    const restored = loadObservationDraft(storage, 'm-1');
    expect(restored!.media[0]).not.toHaveProperty('blob');
    expect(restored!.media[0].uri).toBe('idb://p-3');
  });

  it('closed drafts are never written', () => {
    const storage = createMemoryDraftStorage();
    saveObservationDraft(storage, 'm-1', closedObservationDraft());
    expect(loadObservationDraft(storage, 'm-1')).toBeNull();
  });

  it('clearing removes the draft so a later load cannot resurrect it', () => {
    const storage = createMemoryDraftStorage();
    const open = run(closedObservationDraft(), { type: 'begin' }, { type: 'addMedia', media: photo(1) });
    saveObservationDraft(storage, 'm-1', open);
    clearObservationDraft(storage, 'm-1');
    expect(loadObservationDraft(storage, 'm-1')).toBeNull();
  });

  it('keys are namespaced per meeting', () => {
    expect(observationDraftKey('m-1')).toBe('dokkit:observation-draft:m-1');
    expect(observationDraftKey('m-2')).toBe('dokkit:observation-draft:m-2');
    const storage = createMemoryDraftStorage();
    saveObservationDraft(storage, 'm-1', run(closedObservationDraft(), { type: 'begin' }));
    expect(loadObservationDraft(storage, 'm-2')).toBeNull();
  });

  it('corrupt or non-open payloads load as nothing', () => {
    const storage = createMemoryDraftStorage();
    storage.setItem(observationDraftKey('m-1'), '{not json');
    expect(loadObservationDraft(storage, 'm-1')).toBeNull();
    storage.setItem(observationDraftKey('m-1'), JSON.stringify({ phase: 'closed', text: 'x', media: [] }));
    expect(loadObservationDraft(storage, 'm-1')).toBeNull();
  });
});