/**
 * Dokkit surface mode.
 *
 * Handheld:
 *   < 960px
 *
 * Compact desktop:
 *   960px–1279px
 *
 * Full desktop:
 *   1280px+
 *
 * The surface preference is presentation only.
 * It must never change Dokkit's underlying capabilities or data model.
 */

export type SurfacePreference = 'auto' | 'handheld' | 'desktop';
export type SurfaceMode = 'handheld' | 'desktop';

export const SURFACE_PREF_KEY = 'dokkit-surface-mode';

/**
 * Width at which Dokkit begins using the desktop presentation.
 *
 * 900px was too aggressive: it allowed "desktop" to appear in
 * genuinely cramped layouts.
 */
export const DESKTOP_MIN_WIDTH_PX = 960;

export function readSurfacePreference(): SurfacePreference {
  if (typeof window === 'undefined') return 'auto';

  try {
    const raw = localStorage.getItem(SURFACE_PREF_KEY);

    if (
      raw === 'handheld' ||
      raw === 'desktop' ||
      raw === 'auto'
    ) {
      return raw;
    }
  } catch {
    // Private mode / blocked storage.
  }

  return 'auto';
}

export function writeSurfacePreference(
  preference: SurfacePreference
): void {
  try {
    localStorage.setItem(SURFACE_PREF_KEY, preference);
  } catch {
    // Ignore storage failures.
  }
}

export function detectWideViewport(): boolean {
  if (typeof window === 'undefined') return false;

  return window.matchMedia(
    `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`
  ).matches;
}

export function resolveSurfaceMode(
  preference: SurfacePreference,
  isWide: boolean
): SurfaceMode {
  if (preference === 'desktop') return 'desktop';
  if (preference === 'handheld') return 'handheld';

  return isWide ? 'desktop' : 'handheld';
}

export function applySurfaceAttribute(
  mode: SurfaceMode
): void {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute(
    'data-surface',
    mode
  );
}

export function cycleSurfacePreference(
  current: SurfacePreference
): SurfacePreference {
  if (current === 'auto') return 'desktop';
  if (current === 'desktop') return 'handheld';

  return 'auto';
}

export function surfacePreferenceLabel(
  preference: SurfacePreference
): string {
  switch (preference) {
    case 'auto':
      return 'Auto';

    case 'desktop':
      return 'Desktop';

    case 'handheld':
      return 'Handheld';
  }
}
