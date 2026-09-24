'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useSyncExternalStore } from 'react';
import { PlusIcon } from '@/components/icons';
import {
  getDesktopPrimaryAction,
  subscribeDesktopPrimaryAction,
} from '@/lib/captureOpen';
import type { SurfaceKey } from '@/lib/surfaceCopy';

const PRODUCTS = [
  {
    key: 'today' as const,
    label: 'Today',
    path: '/',
    match: (p: string) => p === '/' || p === '',
  },
  {
    key: 'jobs' as const,
    label: 'Jobs',
    path: '/jobs',
    match: (p: string) => p === '/jobs' || p.startsWith('/jobs/'),
  },
  {
    key: 'meetings' as const,
    label: 'Meetings',
    path: '/meetings',
    match: (p: string) => p === '/meetings' || p.startsWith('/meetings/'),
  },
  {
    key: 'travel' as const,
    label: 'Travel',
    path: '/travel',
    match: (p: string) => p === '/travel' || p.startsWith('/travel/'),
  },
];

const NAV_ORDER_KEY = 'dokkit-nav-order';

function readNavOrder(): SurfaceKey[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SurfaceKey[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist emphasis order after onboarding / profile load. */
export function persistNavOrder(order: SurfaceKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
    window.dispatchEvent(new Event('dokkit-nav-order'));
  } catch {
    // ignore
  }
}

function subscribeNavOrder(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('dokkit-nav-order', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('dokkit-nav-order', cb);
    window.removeEventListener('storage', cb);
  };
}

/** Product heart + primary action in one refined bar. */
export default function DesktopProductNav() {
  const pathname = usePathname() || '/';
  const primary = useSyncExternalStore(
    subscribeDesktopPrimaryAction,
    getDesktopPrimaryAction,
    () => null
  );
  const order = useSyncExternalStore(subscribeNavOrder, readNavOrder, () => null);

  const products = useMemo(() => {
    if (!order?.length) return PRODUCTS;
    const byKey = new Map(PRODUCTS.map((p) => [p.key, p]));
    const sorted: typeof PRODUCTS = [];
    for (const key of order) {
      const item = byKey.get(key);
      if (item) sorted.push(item);
    }
    for (const p of PRODUCTS) {
      if (!sorted.includes(p)) sorted.push(p);
    }
    return sorted;
  }, [order]);

  return (
    <header className="desk-product-nav" aria-label="Products">
      <div className="desk-product-nav-inner">
        <span className="desk-product-brand">Dokkit</span>

        <nav className="desk-product-tabs" role="tablist" aria-label="Surfaces">
          {products.map((item) => {
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
