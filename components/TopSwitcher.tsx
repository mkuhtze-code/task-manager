'use client';

import { useRouter } from 'next/navigation';
import type { Surface } from '@/lib/thinking/types';

// Compact Today / Jobs / Travel switcher — a quiet inline text control that
// slots into the existing app/header chrome instead of consuming a full row
// of pills. Active surface is bold ink, inactive is faint, with a hairline
// divider between items. These are Dokkit's app-level destinations; the
// switcher sits in the header on every destination so they're always one
// tap apart and never depend on a back-link chain.
//
// onNavigate fires when the user deliberately taps a different surface.
// The caller can use this to record an active navigation event for
// Personal Gravity (Scope 3G). It does NOT fire when the user taps
// the surface they are already on.
export default function TopSwitcher({
  active,
  onNavigate,
}: {
  active: 'today' | 'jobs' | 'travel' | 'patterns';
  onNavigate?: (surface: Surface) => void;
}) {
  const router = useRouter();

  function go(path: string, surface: Surface) {
    if (surface !== active && onNavigate) {
      onNavigate(surface);
    }
    router.push(path);
  }

  return (
    <div className="view-switcher" role="tablist" aria-label="Switch view">
      <button
        className={active === 'today' ? 'view-switcher-item active' : 'view-switcher-item'}
        onClick={() => go('/', 'today')}
        role="tab"
        aria-selected={active === 'today'}
      >
        Today
      </button>
      <span className="view-switcher-sep" aria-hidden="true" />
      <button
        className={active === 'jobs' ? 'view-switcher-item active' : 'view-switcher-item'}
        onClick={() => go('/jobs', 'jobs')}
        role="tab"
        aria-selected={active === 'jobs'}
      >
        Jobs
      </button>
      <span className="view-switcher-sep" aria-hidden="true" />
      <button
        className={active === 'travel' ? 'view-switcher-item active' : 'view-switcher-item'}
        onClick={() => go('/travel', 'travel')}
        role="tab"
        aria-selected={active === 'travel'}
      >
        Travel
      </button>
    </div>
  );
}
