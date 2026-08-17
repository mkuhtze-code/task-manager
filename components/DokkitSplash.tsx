'use client';

import { useEffect, useState } from 'react';

/**
 * Dokkit launch splash — a direct port of the standalone HTML demo that
 * was verified working in a real browser. Two scenes (logo mark, then
 * wordmark) sit inside a single persistent backdrop. The backdrop is the
 * only element that ever covers the real app and it stays fully opaque
 * for the whole logo-then-word sequence, so there is never a moment
 * where two overlapping semi-transparent layers let the app bleed
 * through. It fades exactly once, at the very end.
 *
 * Timing:
 *   t = 1050ms  scene 1 exits (breathes in), scene 2 enters (breathes out) — right after the shake ends
 *   t = 3050ms  the backdrop itself fades out — the one and only reveal
 *   t = 4000ms  the whole backdrop is removed from the DOM entirely
 */
export default function DokkitSplash() {
  // 0 = mark shown, 1 = word entering, 2 = backdrop exiting.
  const [phase, setPhase] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // The CSS entrance animations are anchored to first paint — the
    // server-rendered markup + stylesheet paint before React hydrates —
    // while plain timers would start at hydration, drifting the crossfade
    // later than the shake it is meant to follow on slow loads. Re-anchor
    // the schedule to the CSS clock so the crossfade fires right after the
    // shake ends regardless of how long hydration took. The logo-land
    // animation keeps `forwards` fill, so it stays queryable after it
    // finishes (the shake, with no fill, does not).
    const img = document.getElementById('dokkitLogoImg');
    const land =
      img && typeof img.getAnimations === 'function'
        ? img
            .getAnimations()
            .find((a) => (a as { animationName?: string }).animationName === 'dokkit-logo-land')
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
  }, []);

  if (gone) return null;

  const backdropClass =
    phase >= 2 ? 'dokkit-splash-backdrop exit' : 'dokkit-splash-backdrop';
  const logoClass =
    phase >= 1 ? 'dokkit-splash-scene exit' : 'dokkit-splash-scene';
  const wordClass =
    phase >= 1 ? 'dokkit-splash-scene in' : 'dokkit-splash-scene';

  return (
    <div className={backdropClass}>
      <div className={logoClass} id="dokkitLogoScene">
        <div className="dokkit-impact" />
        <img id="dokkitLogoImg" src="/android-chrome-512.png" alt="Dokkit logo" />
      </div>

      <div className={wordClass} id="dokkitWordScene">
        <h1 className="dokkit-wordmark">Dokkit</h1>
      </div>
    </div>
  );
}
