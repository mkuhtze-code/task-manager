'use client';

import { usePathname } from 'next/navigation';

/**
 * Per-surface context under the product tabs.
 * Placeholders until real capacity / filters / trip state plug in.
 */
function contextForPath(pathname: string): { title: string; detail: string; chips: string[] } {
  if (pathname === '/' || pathname === '') {
    return {
      title: 'Today',
      detail: 'Capacity and day signal will live here — slim, not a tall card.',
      chips: ['On track · placeholder', 'Patterns · —'],
    };
  }
  if (pathname.startsWith('/jobs')) {
    return {
      title: 'Jobs',
      detail: 'Filter and board controls for active work.',
      chips: ['Open', 'Done', 'All'],
    };
  }
  if (pathname.startsWith('/meetings')) {
    return {
      title: 'Meetings',
      detail: 'Upcoming vs past, date range — wire later.',
      chips: ['Upcoming', 'Past'],
    };
  }
  if (pathname.startsWith('/travel')) {
    return {
      title: 'Travel',
      detail: 'Active and planned trips.',
      chips: ['Active', 'Planned'],
    };
  }
  if (pathname.startsWith('/analytics')) {
    return {
      title: 'Patterns',
      detail: 'Calibration and history.',
      chips: [],
    };
  }
  return {
    title: 'Dokkit',
    detail: 'Context for this area.',
    chips: [],
  };
}

export default function DesktopContextStrip() {
  const pathname = usePathname() || '/';
  const ctx = contextForPath(pathname);

  return (
    <div className="desk-context-strip" aria-label={`${ctx.title} context`}>
      <div className="desk-context-main">
        <span className="desk-context-title">{ctx.title}</span>
        <span className="desk-context-detail">{ctx.detail}</span>
      </div>
      {ctx.chips.length > 0 && (
        <div className="desk-context-chips" aria-hidden>
          {ctx.chips.map((c) => (
            <span key={c} className="desk-context-chip">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
