import { useCallback, useEffect, useReducer } from 'react';
import type { CapturedMedia } from '@/lib/meetingCapture';
import {
  observationDraftReducer,
  clearObservationDraft,
  loadObservationDraft,
  saveObservationDraft,
  closedObservationDraft,
  type DraftStorage,
} from '@/lib/observationDraft';

// React wrapper around the observation draft core. Uses sessionStorage so
// the draft survives even a full page reload (the Android WebView camera
// path can recreate the whole page); the capture surface reopens itself
// because `state.phase` is 'open' again after the restore. Only begin /
// addMedia / setText / complete / discard drive the lifecycle.
function sessionStorageOrNull(): DraftStorage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export function useObservationDrafting(meetingId: string) {
  const [state, dispatch] = useReducer(observationDraftReducer, null, () => closedObservationDraft());
  const storage = sessionStorageOrNull();

  // Lift a draft that was mid-flight when this page (re)mounted — the OS
  // camera/file picker path can reload the whole page on a WebView.
  useEffect(() => {
    if (!storage) return;
    const restored = loadObservationDraft(storage, meetingId);
    if (restored) dispatch({ type: 'restore', draft: restored });
  }, [storage, meetingId]);

  // Mirror any OPEN draft. Closed drafts are cleared by complete/discard;
  // this effect never writes while closed (it must not clobber a draft
  // that a just-mounted page is about to restore).
  useEffect(() => {
    if (!storage || state.phase !== 'open') return;
    saveObservationDraft(storage, meetingId, state);
  }, [storage, meetingId, state]);

  const begin = useCallback(() => dispatch({ type: 'begin' }), []);
  const setText = useCallback((text: string) => dispatch({ type: 'setText', text }), []);
  const addMedia = useCallback((media: CapturedMedia) => dispatch({ type: 'addMedia', media }), []);
  const removeMedia = useCallback((index: number) => dispatch({ type: 'removeMedia', index }), []);
  const complete = useCallback(() => {
    dispatch({ type: 'complete' });
    const s = sessionStorageOrNull();
    if (s) clearObservationDraft(s, meetingId);
  }, [meetingId]);
  const discard = useCallback(() => {
    dispatch({ type: 'discard' });
    const s = sessionStorageOrNull();
    if (s) clearObservationDraft(s, meetingId);
  }, [meetingId]);

  return { state, begin, setText, addMedia, removeMedia, complete, discard };
}