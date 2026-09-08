import type { CapturedMedia } from '@/lib/meetingCapture';

// ── V2.4 lifecycle fix: the observation draft ─────────────────────────
// The active observation draft is owned as high as the meeting page AND
// mirrored to sessionStorage, because the OS camera/file picker (and the
// meeting page's own loading gate) can unmount — or even fully reload — the
// capture surface while the picker is open. This module is the pure core of
// that ownership: a tiny state machine plus a storage mirror.
//
// The only way out of 'open' is an explicit save (complete) or an explicit
// cancel (discard). A picker returning, a blur/focus transition, a remount
// or a reload is NOT a transition — the same draft simply resumes.

export type ObservationDraftState = {
  phase: 'open' | 'closed';
  text: string;
  media: CapturedMedia[];
};

export type ObservationDraftAction =
  | { type: 'begin' }
  | { type: 'restore'; draft: ObservationDraftState }
  | { type: 'setText'; text: string }
  | { type: 'addMedia'; media: CapturedMedia }
  | { type: 'removeMedia'; index: number }
  | { type: 'complete' }
  | { type: 'discard' };

export function closedObservationDraft(): ObservationDraftState {
  return { phase: 'closed', text: '', media: [] };
}

// The lifecycle rules themselves:
//   closed --begin--> open
//   open   --setText/addMedia/removeMedia--> open   (additive, unrestricted)
//   open   --complete (save succeeded)--> closed
//   open   --discard (explicit cancel)--> closed
// Everything else (a picker returning, a remount, focus/blur) is a no-op.
export function observationDraftReducer(
  state: ObservationDraftState,
  action: ObservationDraftAction
): ObservationDraftState {
  switch (action.type) {
    case 'begin':
      return { phase: 'open', text: '', media: [] };
    case 'restore':
      return action.draft.phase === 'open'
        ? {
            phase: 'open',
            text: typeof action.draft.text === 'string' ? action.draft.text : '',
            media: Array.isArray(action.draft.media) ? action.draft.media : [],
          }
        : state;
    case 'setText':
      return state.phase === 'open' ? { ...state, text: action.text } : state;
    case 'addMedia':
      return state.phase === 'open' ? { ...state, media: [...state.media, action.media] } : state;
    case 'removeMedia':
      return state.phase === 'open'
        ? { ...state, media: state.media.filter((_, i) => i !== action.index) }
        : state;
    case 'complete':
    case 'discard':
      return closedObservationDraft();
    default:
      return state;
  }
}

export function hasDraftContent(state: ObservationDraftState): boolean {
  return state.phase === 'open' && (state.text.trim().length > 0 || state.media.length > 0);
}

// ── Storage mirror ────────────────────────────────────────────────────
// The durable part is only metadata: the bytes were already written to
// IndexedDB at capture time, so the mirror just keeps the idb:// refs (and
// the text) that let a reload bring the same draft back.

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function observationDraftKey(meetingId: string): string {
  return `dokkit:observation-draft:${meetingId}`;
}

function serializeDraft(state: ObservationDraftState): string {
  return JSON.stringify({
    ...state,
    // The blob is the transient session object the bytes were captured in;
    // the durable idb:// refs below it are what a reload rehydrates from.
    media: state.media.map(({ blob: _blob, ...meta }) => meta),
  });
}

export function saveObservationDraft(storage: DraftStorage, meetingId: string, state: ObservationDraftState): void {
  if (state.phase !== 'open') return;
  storage.setItem(observationDraftKey(meetingId), serializeDraft(state));
}

export function loadObservationDraft(storage: DraftStorage, meetingId: string): ObservationDraftState | null {
  const raw = storage.getItem(observationDraftKey(meetingId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ObservationDraftState>;
    if (parsed.phase !== 'open') return null;
    return {
      phase: 'open',
      text: typeof parsed.text === 'string' ? parsed.text : '',
      media: Array.isArray(parsed.media) ? (parsed.media as CapturedMedia[]) : [],
    };
  } catch {
    return null;
  }
}

export function clearObservationDraft(storage: DraftStorage, meetingId: string): void {
  storage.removeItem(observationDraftKey(meetingId));
}

// A minimal in-memory mirror of the Storage interface, used by tests so
// they can prove a reload round-trips a draft without a DOM.
export function createMemoryDraftStorage(): DraftStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}