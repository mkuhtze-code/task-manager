'use client';

import { useEffect, useState } from 'react';

const SPLASH_SESSION_KEY = 'dokkit-launch-splash-seen';

/**
 * Show the launch animation once for an app session. The shared app layout is
 * rendered for every document request, including requests made when navigating
 * through the public /app proxy, so mounting the animation unconditionally
 * would make ordinary route changes look like a new app launch.
 */
export default function DokkitSplash() {
  const [shouldShow, setShouldShow] = useState(false);
  const [phase, setPhase] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY)) return;
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
      setShouldShow(true);
    } catch {
      // If session storage is unavailable, leave the splash hidden rather
      // than interrupting ordinary navigation on every document request.
    }
  }, []);

  useEffect(() => {
    if (!shouldShow) return;

    const img = document.getElementById('dokkitLogoImg');
    const land =
      img && typeof img.getAnimations === 'function'
        ? img
            .getAnimations()
            .find((animation) => (animation as { animationName?: string }).animationName === 'dokkit-logo-land')
        : undefined;
    let cssStart = performance.now();
    if (land && land.startTime != null && land.effect) {
      cssStart = (land.startTime as number) - (land.effect.getTiming().delay ?? 0);
    }
    const at = (target: number) => Math.max(0, cssStart + target - performance.now());
    const t1 = setTimeout(() => setPhase(1), at(1050));
    const t2 = setTimeout(() => setPhase(2), at(3050));
    const t3 = setTimeout(() => setGone(true), at(4000));

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [shouldShow]);

  if (!shouldShow || gone) return null;

  const backdropClass = phase >= 2 ? 'dokkit-splash-backdrop exit' : 'dokkit-splash-backdrop';
  const logoClass = phase >= 1 ? 'dokkit-splash-scene exit' : 'dokkit-splash-scene';
  const wordClass = phase >= 1 ? 'dokkit-splash-scene in' : 'dokkit-splash-scene';

  return (
    <div className={backdropClass}>
      <div className={logoClass} id="dokkitLogoScene">
        <div className="dokkit-impact" />
        <img id="dokkitLogoImg" src="/app/android-chrome-512.png" alt="Dokkit logo" />
      </div>
      <div className={wordClass} id="dokkitWordScene">
        <h1 className="dokkit-wordmark">Dokkit</h1>
      </div>
    </div>
  );
}
