'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Heart of desktop chrome: product surfaces live here, not in the sidebar.
 * Design-first slice — real routes, visual hierarchy we can refine later.
 */
const PRODUCTS = [
  {
    key: 'today',
    label: 'Today',
    path: '/',
    match: (p: string) => p === '/' || p === '',
  },
  {
    key: 'jobs',
    label: 'Jobs',
    path: '/jobs',
    match: (p: string) => p === '/jobs' || p.startsWith('/jobs/'),
  },
  {
    key: 'meetings',
    label: 'Meetings',
    path: '/meetings',
    match: (p: string) => p === '/meetings' || p.startsWith('/meetings/'),
  },
  {
    key: 'travel',
    label: 'Travel',
    path: '/travel',
    match: (p: string) => p === '/travel' || p.startsWith('/travel/'),
  },
] as const;

export default function DesktopProductNav() {
  const pathname = usePathname() || '/';

  return (
    <header className="desk-product-nav" aria-label="Products">
      <div className="desk-product-nav-inner">
        <span className="desk-product-brand" aria-hidden>
          Dokkit
        </span>
        <nav className="desk-product-tabs" role="tablist">
          {PRODUCTS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.key}
                href={item.path}
                role="tab"
                aria-selected={active}
                className={`desk-product-tab${active ? ' desk-product-tab-active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="desk-product-nav-spacer" aria-hidden />
      </div>
    </header>
  );
}
