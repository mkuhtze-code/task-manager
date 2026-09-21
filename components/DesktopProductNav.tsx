'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { PlusIcon } from '@/components/icons';
import {
  getDesktopPrimaryAction,
  subscribeDesktopPrimaryAction,
} from '@/lib/captureOpen';

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

/** Product heart + primary action in one refined bar. */
export default function DesktopProductNav() {
  const pathname = usePathname() || '/';
  const primary = useSyncExternalStore(
    subscribeDesktopPrimaryAction,
    getDesktopPrimaryAction,
    () => null
  );

  return (
    <header className="desk-product-nav" aria-label="Products">
      <div className="desk-product-nav-inner">
        <span className="desk-product-brand">Dokkit</span>

        <nav className="desk-product-tabs" role="tablist" aria-label="Surfaces">
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
                <span className="desk-product-tab-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {primary && (
          <button
            type="button"
            className="btn btn-steel desk-product-primary"
            onClick={() => primary.run()}
          >
            <PlusIcon size={15} />
            <span>{primary.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
