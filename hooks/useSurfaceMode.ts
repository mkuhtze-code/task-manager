'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  applySurfaceAttribute,
  detectWideViewport,
  readSurfacePreference,
  resolveSurfaceMode,
  writeSurfacePreference,
  type SurfaceMode,
  type SurfacePreference,
} from '@/lib/surfaceMode';

export function useSurfaceMode(): {
  mode: SurfaceMode;
  preference: SurfacePreference;
  isDesktop: boolean;
  setPreference: (pref: SurfacePreference) => void;
} {
  const [preference, setPreferenceState] = useState<SurfacePreference>('auto');
  const [isWide, setIsWide] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pref = readSurfacePreference();
    const wide = detectWideViewport();
    setPreferenceState(pref);
    setIsWide(wide);
    applySurfaceAttribute(resolveSurfaceMode(pref, wide));
    setReady(true);

    const mq = window.matchMedia(`(min-width: ${900}px)`);
    function onChange(e: MediaQueryListEvent) {
      setIsWide(e.matches);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const mode = resolveSurfaceMode(preference, isWide);

  useEffect(() => {
    if (!ready) return;
    applySurfaceAttribute(mode);
  }, [mode, ready]);

  const setPreference = useCallback((pref: SurfacePreference) => {
    writeSurfacePreference(pref);
    setPreferenceState(pref);
  }, []);

  return {
    mode,
    preference,
    isDesktop: mode === 'desktop',
    setPreference,
  };
}
