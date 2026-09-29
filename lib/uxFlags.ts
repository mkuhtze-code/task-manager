/**
 * Quiet, once-only UX flags (localStorage).
 * Not settings the user manages — instrument polish only.
 */

const PREFIX = 'dokkit.ux.';

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return true; // SSR: don't show once-hints
  try {
    return window.localStorage.getItem(PREFIX + key) === '1';
  } catch {
    return true;
  }
}

function writeFlag(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + key, '1');
  } catch {
    /* ignore quota */
  }
}

/** Reality Check intro line — show at most once per browser. */
export function shouldShowRealityIntro(): boolean {
  return !readFlag('reality_intro_v1');
}

export function markRealityIntroSeen(): void {
  writeFlag('reality_intro_v1');
}

/** Capture estimate micro-hint — once. */
export function shouldShowEstimateHint(): boolean {
  return !readFlag('estimate_hint_v1');
}

export function markEstimateHintSeen(): void {
  writeFlag('estimate_hint_v1');
}
