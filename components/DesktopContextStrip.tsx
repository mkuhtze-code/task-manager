'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

type Context = { kicker: string; headline: string };

function contextForPath(pathname: string): Context | null {
  if (pathname === '/' || pathname === '') return null;
  if (pathname === '/jobs' || pathname === '/meetings' || pathname === '/travel') return null;

  if (pathname.startsWith('/jobs/')) return { kicker: 'Jobs', headline: 'Work across days, connected to Today' };
  if (pathname.startsWith('/meetings/')) return { kicker: 'Meetings', headline: 'Conversations in time, connected to work and the day' };
  if (pathname.startsWith('/travel/')) return { kicker: 'Travel', headline: 'Movement through time and place, connected to the day' };

  if (pathname.startsWith('/analytics')) return { kicker: 'Patterns', headline: 'How Dokkit learns from reality' };
  if (pathname.startsWith('/preferences')) return { kicker: 'Settings', headline: 'How Dokkit behaves' };
  if (pathname.startsWith('/account')) return { kicker: 'Settings', headline: 'Account' };
  if (pathname.startsWith('/contact') || pathname === '/feedback') return { kicker: 'Support', headline: 'Contact Dokkit' };
  return null;
}

export default function DesktopContextStrip() {
  const pathname = usePathname() || '/';
  const context = useMemo(() => contextForPath(pathname), [pathname]);
  if (!context) return null;

  return (
    <div className="desk-context-strip" aria-label={context.kicker + ' context'}>
      <div className="desk-context-main">
        <span className="desk-context-kicker">{context.kicker}</span>
        <span className="desk-context-headline">{context.headline}</span>
      </div>
    </div>
  );
}