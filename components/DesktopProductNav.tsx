'use client';

import Link from 'next/link';
import {
  usePathname,
  useRouter,
} from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

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
    match: (pathname: string) =>
      pathname === '/' || pathname === '',
  },
  {
    key: 'jobs' as const,
    label: 'Jobs',
    path: '/jobs',
    pro: true,
    match: (pathname: string) =>
      pathname === '/jobs' ||
      pathname.startsWith('/jobs/'),
  },
  {
    key: 'meetings' as const,
    label: 'Meetings',
    path: '/meetings',
    pro: true,
    match: (pathname: string) =>
      pathname === '/meetings' ||
      pathname.startsWith('/meetings/'),
  },
  {
    key: 'travel' as const,
    label: 'Travel',
    path: '/travel',
    pro: true,
    match: (pathname: string) =>
      pathname === '/travel' ||
      pathname.startsWith('/travel/'),
  },
];

const NAV_ORDER_KEY = 'dokkit-nav-order';

let navOrderCacheRaw:
  | string
  | null
  | undefined = undefined;

let navOrderCache:
  | SurfaceKey[]
  | null = null;

function readNavOrder(): SurfaceKey[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      NAV_ORDER_KEY
    );

    if (raw === navOrderCacheRaw) {
      return navOrderCache;
    }

    navOrderCacheRaw = raw;

    if (!raw) {
      navOrderCache = null;
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      navOrderCache = null;
      return null;
    }

    navOrderCache = parsed as SurfaceKey[];

    return navOrderCache;
  } catch {
    navOrderCacheRaw = undefined;
    navOrderCache = null;
    return null;
  }
}

export function persistNavOrder(
  order: SurfaceKey[]
): void {
  if (typeof window === 'undefined') return;

  try {
    const next = JSON.stringify(order);
    const previous =
      window.localStorage.getItem(
        NAV_ORDER_KEY
      );

    if (previous === next) return;

    window.localStorage.setItem(
      NAV_ORDER_KEY,
      next
    );

    navOrderCacheRaw = next;
    navOrderCache = order.slice() as SurfaceKey[];

    window.dispatchEvent(
      new Event('dokkit-nav-order')
    );
  } catch {
    // Ignore storage failures.
  }
}

function subscribeNavOrder(
  callback: () => void
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(
    'dokkit-nav-order',
    callback
  );

  window.addEventListener(
    'storage',
    callback
  );

  return () => {
    window.removeEventListener(
      'dokkit-nav-order',
      callback
    );

    window.removeEventListener(
      'storage',
      callback
    );
  };
}

/**
 * Persistent product navigation.
 *
 * This is navigation, not an in-page tab system.
 */
export default function DesktopProductNav() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const primary =
    useSyncExternalStore(
      subscribeDesktopPrimaryAction,
      getDesktopPrimaryAction,
      () => null
    );

  // Jobs / Meetings / Travel list headers own the create CTA — do not
  // also show the top-nav primary (double "add" buttons).
  // Surfaces that place create/dock in their own workspace header.
  const surfaceOwnsPrimary =
    pathname === '/' ||
    pathname === '' ||
    pathname === '/jobs' ||
    pathname === '/meetings' ||
    pathname === '/travel';
  const showPrimary = Boolean(primary) && !surfaceOwnsPrimary;

  const order =
    useSyncExternalStore(
      subscribeNavOrder,
      readNavOrder,
      () => null
    );

  const { entitlements } =
    useEntitlements();

  const isPro = entitlements.isPro;

  const [proOpen, setProOpen] =
    useState(false);

  const proRef =
    useRef<HTMLDivElement>(null);

  const products = useMemo(() => {
    if (!order?.length) {
      return PRODUCTS;
    }

    const byKey = new Map(
      PRODUCTS.map((product) => [
        product.key,
        product,
      ])
    );

    const sorted: typeof PRODUCTS = [];

    for (const key of order) {
      const item = byKey.get(
        key as (typeof PRODUCTS)[number]['key']
      );

      if (item) {
        sorted.push(item);
      }
    }

    for (const product of PRODUCTS) {
      if (!sorted.includes(product)) {
        sorted.push(product);
      }
    }

    return sorted;
  }, [order]);

  const visible = isPro
    ? products
    : products.filter(
        (product) => !product.pro
      );

  const proProducts = products.filter(
    (product) => product.pro
  );

  useEffect(() => {
    if (!proOpen) return;

    function handleOutside(
      event: MouseEvent
    ) {
      if (
        proRef.current &&
        !proRef.current.contains(
          event.target as Node
        )
      ) {
        setProOpen(false);
      }
    }

    function handleKey(
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape') {
        setProOpen(false);
      }
    }

    document.addEventListener(
      'mousedown',
      handleOutside
    );

    document.addEventListener(
      'keydown',
      handleKey
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutside
      );

      document.removeEventListener(
        'keydown',
        handleKey
      );
    };
  }, [proOpen]);

  return (
    <header
      className="desk-product-nav"
      aria-label="Dokkit"
    >
      <div className="desk-product-nav-inner">
        <span className="desk-product-brand">
          Dokkit
        </span>

        <nav
          className="desk-product-tabs"
          aria-label="Products"
        >
          {visible.map((item) => {
            const active =
              item.match(pathname);

            return (
              <Link
                key={item.key}
                href={item.path}
                aria-current={
                  active
                    ? 'page'
                    : undefined
                }
                className={[
                  'desk-product-tab',
                  active
                    ? 'desk-product-tab-active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="desk-product-tab-label">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {!isPro && (
            <div
              className="desk-product-pro-wrap"
              ref={proRef}
            >
              <button
                type="button"
                className="desk-product-tab desk-product-tab-plan"
                aria-expanded={proOpen}
                aria-haspopup="dialog"
                onClick={() =>
                  setProOpen(
                    (value) => !value
                  )
                }
              >
                <span className="desk-product-tab-label">
                  Dokkit
                </span>
              </button>

              {proOpen && (
                <div
                  className="desk-plan-popover"
                  role="dialog"
                  aria-label="Dokkit plan"
                >
                  <p className="desk-plan-popover-title">
                    Included with Dokkit
                  </p>

                  <ul className="desk-plan-popover-list">
                    {proProducts.map(
                      (product) => (
                        <li
                          key={product.key}
                        >
                          <button
                            type="button"
                            className="desk-plan-popover-item"
                            onClick={() => {
                              setProOpen(false);

                              router.push(
                                `/account/billing?feature=${product.key}`
                              );
                            }}
                          >
                            {product.label}
                          </button>
                        </li>
                      )
                    )}
                  </ul>

                  <button
                    type="button"
                    className="btn btn-steel desk-plan-popover-cta"
                    onClick={() => {
                      setProOpen(false);
                      router.push(
                        '/account/billing'
                      );
                    }}
                  >
                    View plan
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>

        {showPrimary && primary && (
          <button
            type="button"
            className="btn btn-steel desk-product-primary"
            onClick={() =>
              primary.run()
            }
          >
            <PlusIcon size={15} />

            <span>
              {primary.label}
            </span>
          </button>
        )}

        <GearMenu />
      </div>
    </header>
  );
}
