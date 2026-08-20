'use client';

import { useRouter } from 'next/navigation';
import type { Surface } from '@/lib/thinking/types';

// Persistent bottom navigation — Today · Jobs · Travel.
// The GROUP provides structural weight; individual labels stay restrained.
// onNavigate fires only when the user taps a different surface, feeding
// Personal Gravity (Scope 3G) with evidence of deliberate navigation.
export default function SurfaceNav({
  active,
  onNavigate,
}: {
  active: 'today' | 'jobs' | 'travel';
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
    </nav>
  );
}
