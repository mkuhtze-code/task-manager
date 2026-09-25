'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons';
import { useEntitlements } from '@/hooks/useEntitlements';
import type { Surface } from '@/lib/taskTypes';

export type NavSurface = Surface | 'meetings';

const ALL_ITEMS: { key: NavSurface; label: string; path: string; pro?: boolean }[] = [
  { key: 'today', label: 'Today', path: '/' },
  { key: 'jobs', label: 'Jobs', path: '/jobs' },
  { key: 'meetings', label: 'Meetings', path: '/meetings', pro: true },
  { key: 'travel', label: 'Travel', path: '/travel' },
];

function SectionGlyph({ surface }: { surface: NavSurface }) {
  switch (surface) {
    case 'today':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'jobs':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'meetings':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 6h16v10H4V6zM8 20h8M12 16v4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'travel':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l7 6.5V20H5V9.5L12 3z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

export default function SurfaceNav({
  active,
  onNavigate,
  onAdd,
  addLabel,
  sectionOrder,
}: {
  active: NavSurface;
  onNavigate?: (s: Surface) => void;
  onAdd?: () => void;
  addLabel?: string;
  sectionOrder?: NavSurface[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { entitlements } = useEntitlements();
  const isPro = entitlements.canUseMeetings;

  const ordered = (() => {
    if (!sectionOrder?.length) return ALL_ITEMS;
    const byKey = new Map(ALL_ITEMS.map((i) => [i.key, i]));
    const out: typeof ALL_ITEMS = [];
    for (const k of sectionOrder) {
      const item = byKey.get(k);
      if (item) out.push(item);
    }
    for (const i of ALL_ITEMS) {
      if (!out.includes(i)) out.push(i);
    }
    return out;
  })();

  const freeItems = ordered.filter((i) => !i.pro);
  const proItems = ordered.filter((i) => i.pro);
  const current = ordered.find((i) => i.key === active) || ordered[0];

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function go(path: string, surface?: Surface) {
    setOpen(false);
    if (surface && surface !== active && onNavigate) {
      onNavigate(surface);
    }
    router.push(path);
  }

  return (
    <nav className="surface-nav" aria-label="Surface navigation">
      <div className="surface-switcher" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          className="surface-switcher-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={open ? 'surface-switcher-menu' : undefined}
          aria-label={`Sections — ${current.label}`}
        >
          <SectionGlyph surface={active} />
        </button>

        {open && (
          <div id="surface-switcher-menu" className="surface-menu">
            {(isPro ? ordered : freeItems).map(({ key, label, path }) => {
              const isCurrent = key === active;
              return (
                <button
                  key={key}
                  type="button"
                  className={isCurrent ? 'surface-menu-item current' : 'surface-menu-item'}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() =>
                    isCurrent
                      ? setOpen(false)
                      : go(path, key === 'meetings' ? undefined : (key as Surface))
                  }
                >
                  <span className="surface-menu-icon">
                    <SectionGlyph surface={key} />
                  </span>
                  <span className="surface-menu-label">{label}</span>
                  {isCurrent && <span className="surface-menu-marker" aria-hidden="true" />}
                </button>
              );
            })}

            {!isPro && (
              <>
                <div className="surface-menu-divider" role="separator" />
                <p className="surface-menu-group-label">Dokkit plan</p>
                {proItems.map(({ key, label, path }) => (
                  <button
                    key={key}
                    type="button"
                    className="surface-menu-item surface-menu-item-pro"
                    onClick={() => go(path)}
                  >
                    <span className="surface-menu-icon">
                      <SectionGlyph surface={key} />
                    </span>
                    <span className="surface-menu-label">{label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="surface-menu-item surface-menu-upgrade"
                  onClick={() => go('/account/billing')}
                >
                  <span className="surface-menu-label">View plan</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {onAdd && (
        <button type="button" className="surface-add" onClick={onAdd} aria-label={addLabel ?? 'Add'}>
          <PlusIcon size={20} />
        </button>
      )}
    </nav>
  );
}
