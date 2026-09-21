'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

type Chip = { label: string; tone?: 'default' | 'good' | 'warn' | 'active' };

type Context = {
  kicker: string;
  headline: string;
  chips: Chip[];
};

function todayContext(): Context {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const date = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return {
    kicker: 'Today',
    headline: `${weekday} · ${date}`,
    chips: [
      { label: 'Capacity', tone: 'good' },
      { label: 'Patterns', tone: 'default' },
    ],
  };
}

function contextForPath(pathname: string): Context {
  if (pathname === '/' || pathname === '') return todayContext();

  if (pathname.startsWith('/jobs/')) {
    return {
      kicker: 'Job',
      headline: 'Workspace',
      chips: [{ label: 'Tasks', tone: 'active' }],
    };
  }
  if (pathname.startsWith('/jobs')) {
    return {
      kicker: 'Jobs',
      headline: 'Active work across days',
      chips: [
        { label: 'Open', tone: 'active' },
        { label: 'Done', tone: 'default' },
        { label: 'All', tone: 'default' },
      ],
    };
  }
  if (pathname.startsWith('/meetings/')) {
    return {
      kicker: 'Meeting',
      headline: 'Notes & follow-ups',
      chips: [],
    };
  }
  if (pathname.startsWith('/meetings')) {
    return {
      kicker: 'Meetings',
      headline: 'Conversations that become work',
      chips: [
        { label: 'Upcoming', tone: 'active' },
        { label: 'Past', tone: 'default' },
      ],
    };
  }
  if (pathname.startsWith('/travel/')) {
    return {
      kicker: 'Trip',
      headline: 'Itinerary',
      chips: [],
    };
  }
  if (pathname.startsWith('/travel')) {
    return {
      kicker: 'Travel',
      headline: 'Trips and time away',
      chips: [
        { label: 'Active', tone: 'active' },
        { label: 'Planned', tone: 'default' },
      ],
    };
  }
  if (pathname.startsWith('/analytics')) {
    return {
      kicker: 'Patterns',
      headline: 'How time actually goes',
      chips: [],
    };
  }
  if (pathname.startsWith('/preferences')) {
    return { kicker: 'Settings', headline: 'Preferences', chips: [] };
  }
  if (pathname.startsWith('/account')) {
    return { kicker: 'Settings', headline: 'Account', chips: [] };
  }

  return { kicker: 'Dokkit', headline: '', chips: [] };
}

/** Elegant per-surface context under the product heart. */
export default function DesktopContextStrip() {
  const pathname = usePathname() || '/';
  const ctx = useMemo(() => contextForPath(pathname), [pathname]);

  if (!ctx.headline && ctx.chips.length === 0) return null;

  return (
    <div className="desk-context-strip" aria-label={`${ctx.kicker} context`}>
      <div className="desk-context-main">
        <span className="desk-context-kicker">{ctx.kicker}</span>
        {ctx.headline && <span className="desk-context-headline">{ctx.headline}</span>}
      </div>
      {ctx.chips.length > 0 && (
        <div className="desk-context-chips" role="group" aria-label="View">
          {ctx.chips.map((c) => (
            <span
              key={c.label}
              className={`desk-context-chip${c.tone && c.tone !== 'default' ? ` desk-context-chip-${c.tone}` : ''}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
