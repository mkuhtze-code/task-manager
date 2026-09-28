'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

type Context = {
  kicker: string;
  headline: string;
};

function contextForPath(pathname: string): Context | null {
  /*
   * Today already owns its intelligent status header.
   * Do not duplicate it here.
   */
  if (pathname === '/' || pathname === '') {
    return null;
  }

  if (pathname.startsWith('/jobs/')) {
    return {
      kicker: 'Job',
      headline: 'Work that stays connected',
    };
  }

  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
    return {
      kicker: 'Jobs',
      headline: 'Work that spans days',
    };
  }

  if (
    pathname === '/meetings' ||
    pathname.startsWith('/meetings/')
  ) {
    return {
      kicker: 'Meetings',
      headline: 'Conversations that become work',
    };
  }

  if (
    pathname === '/travel' ||
    pathname.startsWith('/travel/')
  ) {
    return {
      kicker: 'Travel',
      headline: 'Trips and time away',
    };
  }

  if (
    pathname === '/analytics' ||
    pathname.startsWith('/analytics/')
  ) {
    return {
      kicker: 'Patterns',
      headline: 'How Dokkit learns from reality',
    };
  }

  if (
    pathname === '/preferences' ||
    pathname.startsWith('/preferences/')
  ) {
    return {
      kicker: 'Settings',
      headline: 'Preferences',
    };
  }

  if (
    pathname === '/account' ||
    pathname.startsWith('/account/')
  ) {
    return {
      kicker: 'Settings',
      headline: 'Account',
    };
  }

  if (
    pathname === '/contact' ||
    pathname.startsWith('/contact/') ||
    pathname === '/feedback'
  ) {
    return {
      kicker: 'Support',
      headline: 'Contact Dokkit',
    };
  }

  return null;
}

/**
 * Small desktop context layer.
 *
 * This is deliberately NOT a second page header.
 * Surface-specific pages own their real controls and data.
 */
export default function DesktopContextStrip() {
  const pathname = usePathname() || '/';

  const context = useMemo(
    () => contextForPath(pathname),
    [pathname]
  );

  if (!context) return null;

  return (
    <div
      className="desk-context-strip"
      aria-label={`${context.kicker} context`}
    >
      <div className="desk-context-main">
        <span className="desk-context-kicker">
          {context.kicker}
        </span>

        <span className="desk-context-headline">
          {context.headline}
        </span>
      </div>
    </div>
  );
}
