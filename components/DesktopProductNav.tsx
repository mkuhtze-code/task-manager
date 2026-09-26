'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PlusIcon } from '@/components/icons';
import GearMenu from '@/components/GearMenu';
import {
  getDesktopPrimaryAction,
  subscribeDesktopPrimaryAction,
} from '@/lib/captureOpen';
import type { SurfaceKey } from '@/lib/surfaceCopy';
import { useEntitlements } from '@/hooks/useEntitlements';

const PRODUCTS = [
  {
    key: 'today' as const,
    label: 'Today',
    path: '/',
    pro: false,
    match: (p: string) => p === '/' || p === '',
  },
  {
    key: 'jobs' as const,
    label: 'Jobs',
    path: '/jobs',
    pro: true,
    match: (p: string) => p === '/jobs' || p.startsWith('/jobs/'),
  },
  {
    key: 'meetings' as const,
    label: 'Meetings',
    path: '/meetings',
    pro: true,
    match: (p: string) => p === '/meetings' || p.startsWith('/meetings/'),
  },
  {
    key: 'travel' as const,
    label: 'Travel',
    path: '/travel',
    pro: true,
    match: (p: string) => p === '/travel' || p.startsWith('/travel/'),
  },
];

const NAV_ORDER_KEY = 'dokkit-nav-order';

/** Cached snapshot for useSyncExternalStore — stable reference when unchanged. */
let navOrderCacheRaw: string | null | undefined = undefined;
let navOrderCache: SurfaceKey[] | null = null;

function readNavOrder(): SurfaceKey[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_KEY);
    if (raw === navOrderCacheRaw) return navOrderCache;
    navOrderCacheRaw = raw;
    if (!raw) {
      navOrderCache = null;
      return null;
    }
    const parsed = JSON.parse(raw) as SurfaceKey[];
    if (!Array.isArray(parsed)) {
      navOrderCache = null;
      return null;
    }
    navOrderCache = parsed;
    return navOrderCache;
  } catch {
    navOrderCacheRaw = undefined;
    navOrderCache = null;
    return null;
  }
}

/** Persist emphasis order after onboarding / profile load. */
export function persistNavOrder(order: SurfaceKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    const next = JSON.stringify(order);
    const prev = window.localStorage.getItem(NAV_ORDER_KEY);
    if (prev === next) return;
    window.localStorage.setItem(NAV_ORDER_KEY, next);
    navOrderCacheRaw = next;
    navOrderCache = order.slice() as SurfaceKey[];
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
  const router = useRouter();
  const primary = useSyncExternalStore(
    subscribeDesktopPrimaryAction,
    getDesktopPrimaryAction,
    () => null
  );
  const order = useSyncExternalStore(subscribeNavOrder, readNavOrder, () => null);
  const { entitlements } = useEntitlements();
  const isPro = entitlements.isPro;
  const [proOpen, setProOpen] = useState(false);
  const proRef = useRef<HTMLDivElement>(null);

  const products = useMemo(() => {
    if (!order?.length) return PRODUCTS;
    const byKey = new Map(PRODUCTS.map((p) => [p.key, p]));
    const sorted: typeof PRODUCTS = [];
    for (const key of order) {
      const item = byKey.get(key as (typeof PRODUCTS)[number]['key']);
      if (item) sorted.push(item);
    }
    for (const p of PRODUCTS) {
      if (!sorted.includes(p)) sorted.push(p);
    }
    return sorted;
  }, [order]);

  const visible = isPro ? products : products.filter((p) => !p.pro);
  const proProducts = products.filter((p) => p.pro);

  useEffect(() => {
    if (!proOpen) return;
    function outside(e: MouseEvent) {
      if (proRef.current && !proRef.current.contains(e.target as Node)) {
        setProOpen(false);
      }
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setProOpen(false);
    }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [proOpen]);

  return (
    <header className="desk-product-nav" aria-label="Products">
      <div className="desk-product-nav-inner">
        <span className="desk-product-brand">Dokkit</span>

        <nav className="desk-product-tabs" role="tablist" aria-label="Surfaces">
          {visible.map((item) => {
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

          {!isPro && (
            <div className="desk-product-pro-wrap" ref={proRef}>
              <button
                type="button"
                className="desk-product-tab desk-product-tab-plan"
                aria-expanded={proOpen}
                aria-haspopup="dialog"
                onClick={() => setProOpen((v) => !v)}
              >
                <span className="desk-product-tab-label">Dokkit</span>
              </button>
              {proOpen && (
                <div className="desk-plan-popover" role="dialog" aria-label="Dokkit plan">
                  <p className="desk-plan-popover-title">Included with Dokkit</p>
                  <ul className="desk-plan-popover-list">
                    {proProducts.map((p) => (
                      <li key={p.key}>
                        <button
                          type="button"
                          className="desk-plan-popover-item"
                          onClick={() => {
                            setProOpen(false);
                            router.push(`/account/billing?feature=${p.key}`);
                          }}
                        >
                          {p.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-steel desk-plan-popover-cta"
                    onClick={() => {
                      setProOpen(false);
                      router.push('/account/billing');
                    }}
                  >
                    View plan
                  </button>
                </div>
              )}
            </div>
          )}
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
        <GearMenu />
      </div>
    </header>
  );
}
