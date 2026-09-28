'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  applySurfaceAttribute,
  detectWideViewport,
  readSurfacePreference,
  resolveSurfaceMode,
  writeSurfacePreference,
  DESKTOP_MIN_WIDTH_PX,
  type SurfaceMode,
  type SurfacePreference,
} from '@/lib/surfaceMode';

export function useSurfaceMode(): {
  mode: SurfaceMode;
  preference: SurfacePreference;
  isDesktop: boolean;
  setPreference: (preference: SurfacePreference) => void;
} {
  const [preference, setPreferenceState] =
    useState<SurfacePreference>('auto');

  const [isWide, setIsWide] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedPreference = readSurfacePreference();
    const wide = detectWideViewport();

    setPreferenceState(storedPreference);
    setIsWide(wide);

    const initialMode = resolveSurfaceMode(
      storedPreference,
      wide
    );

    applySurfaceAttribute(initialMode);
    setReady(true);

    const mediaQuery = window.matchMedia(
      `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`
    );

    function handleViewportChange(
      event: MediaQueryListEvent
    ) {
      setIsWide(event.matches);
    }

    mediaQuery.addEventListener(
      'change',
      handleViewportChange
    );

    return () => {
      mediaQuery.removeEventListener(
        'change',
        handleViewportChange
      );
    };
  }, []);

  const mode = resolveSurfaceMode(
    preference,
    isWide
  );

  useEffect(() => {
    if (!ready) return;

    applySurfaceAttribute(mode);
  }, [mode, ready]);

  const setPreference = useCallback(
    (nextPreference: SurfacePreference) => {
      writeSurfacePreference(nextPreference);
      setPreferenceState(nextPreference);
    },
    []
  );

  return {
    mode,
    preference,
    isDesktop: mode === 'desktop',
    setPreference,
  };
}
