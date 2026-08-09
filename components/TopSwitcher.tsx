'use client';

import { useRouter } from 'next/navigation';

export default function TopSwitcher({ active }: { active: 'today' | 'travel' }) {
  const router = useRouter();
  return (
    <div className="day-toggle-row" style={{ margin: '0 0 var(--space-3)', width: '100%' }}>
      <button
        className={active === 'today' ? 'day-toggle-btn active' : 'day-toggle-btn'}
        style={{ width: 'auto', borderRadius: 20, padding: '0 16px', flexShrink: 0 }}
        onClick={() => router.push('/')}
      >
        Today
      </button>
      <button
        className={active === 'travel' ? 'day-toggle-btn active' : 'day-toggle-btn'}
        style={{ width: 'auto', borderRadius: 20, padding: '0 16px', flexShrink: 0 }}
        onClick={() => router.push('/travel')}
      >
        Travel
      </button>
    </div>
  );
}
