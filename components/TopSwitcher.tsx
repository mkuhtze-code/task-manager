'use client';

import { useRouter } from 'next/navigation';

// Compact Today / Travel switcher — a quiet inline text control that slots
// into the existing app/header chrome instead of consuming a full row of
// pills. Active surface is bold ink, inactive is faint, with a hairline
// divider between items. These are Dokkit's app-level destinations; the
// switcher sits in the header on every destination so they're always one
// tap apart and never depend on a back-link chain.
export default function TopSwitcher({ active }: { active: 'today' | 'travel' | 'patterns' }) {
  const router = useRouter();
  return (
    <div className="view-switcher" role="tablist" aria-label="Switch view">
      <button
        className={active === 'today' ? 'view-switcher-item active' : 'view-switcher-item'}
        onClick={() => router.push('/')}
        role="tab"
        aria-selected={active === 'today'}
      >
        Today
      </button>
      <span className="view-switcher-sep" aria-hidden="true" />
      <button
        className={active === 'travel' ? 'view-switcher-item active' : 'view-switcher-item'}
        onClick={() => router.push('/travel')}
        role="tab"
        aria-selected={active === 'travel'}
      >
        Travel
      </button>
    </div>
  );
}
