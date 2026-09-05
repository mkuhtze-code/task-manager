'use client';

import { useRouter } from 'next/navigation';
import type { Surface } from '@/lib/thinking/types';

// The four navigable places. Meetings is deliberately NOT part of the
// Gravity `Surface` union — it has its own nav entry but does not feed
// Personal Gravity's surface analysis (it is not a thought-scheduling
// surface), so the thinking engine's Surface type stays untouched.
export type NavSurface = Surface | 'meetings';

// Persistent bottom navigation — Today · Jobs · Travel · Meetings.
// The GROUP provides structural weight; individual labels stay restrained.
// onNavigate fires only when the user taps a different surface, feeding
// Personal Gravity (Scope 3G) with evidence of deliberate navigation.
// The Meetings button never fires onNavigate, because Meetings is outside
// the Gravity surface model.
export default function SurfaceNav({
  active,
  onNavigate,
}: {
  active: NavSurface;
  onNavigate?: (surface: Surface) => void;
}) {
  const router = useRouter();

  function go(path: string, surface?: Surface) {
    if (surface && surface !== active && onNavigate) {
      onNavigate(surface);
    }
    router.push(path);
  }

  return (
    <nav className="surface-nav" aria-label="Surface navigation">
      <button
        className={active === 'today' ? 'surface-nav-item active' : 'surface-nav-item'}
        onClick={() => go('/', 'today')}
        aria-current={active === 'today' ? 'page' : undefined}
      >
        Today
      </button>
      <button
        className={active === 'jobs' ? 'surface-nav-item active' : 'surface-nav-item'}
        onClick={() => go('/jobs', 'jobs')}
        aria-current={active === 'jobs' ? 'page' : undefined}
      >
        Jobs
      </button>
      <button
        className={active === 'travel' ? 'surface-nav-item active' : 'surface-nav-item'}
        onClick={() => go('/travel', 'travel')}
        aria-current={active === 'travel' ? 'page' : undefined}
      >
        Travel
      </button>
      <button
        className={active === 'meetings' ? 'surface-nav-item active' : 'surface-nav-item'}
        onClick={() => go('/meetings')}
        aria-current={active === 'meetings' ? 'page' : undefined}
      >
        Meetings
      </button>
    </nav>
  );
}
