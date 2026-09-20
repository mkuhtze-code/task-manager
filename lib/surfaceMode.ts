/**
 * Surface mode: handheld (phone/tablet portrait patterns) vs desktop dashboard.
 * Preference is stored in localStorage; "auto" follows viewport width.
 */

export type SurfacePreference = 'auto' | 'handheld' | 'desktop';
export type SurfaceMode = 'handheld' | 'desktop';

export const SURFACE_PREF_KEY = 'dokkit-surface-mode';

/** Viewport width at which auto mode switches to desktop. */
export const DESKTOP_MIN_WIDTH_PX = 900;

export function readSurfacePreference(): SurfacePreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(SURFACE_PREF_KEY);
    if (raw === 'handheld' || raw === 'desktop' || raw === 'auto') return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return 'auto';
}

export function writeSurfacePreference(pref: SurfacePreference): void {
  try {
    localStorage.setItem(SURFACE_PREF_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function detectWideViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`).matches;
}

export function resolveSurfaceMode(
  preference: SurfacePreference,
  isWide: boolean
): SurfaceMode {
  if (preference === 'desktop') return 'desktop';
  if (preference === 'handheld') return 'handheld';
  return isWide ? 'desktop' : 'handheld';
}

export function applySurfaceAttribute(mode: SurfaceMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-surface', mode);
}

export function cycleSurfacePreference(current: SurfacePreference): SurfacePreference {
  if (current === 'auto') return 'desktop';
  if (current === 'desktop') return 'handheld';
  return 'auto';
}

export function surfacePreferenceLabel(pref: SurfacePreference): string {
  switch (pref) {
    case 'auto':
      return 'Auto';
    case 'desktop':
      return 'Desktop';
    case 'handheld':
      return 'Handheld';
  }
}
