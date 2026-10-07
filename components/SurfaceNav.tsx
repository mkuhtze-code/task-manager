'use client';

/**
 * Mobile surface nav — always-visible equal tabs for Today / Jobs / Meetings / Travel.
 * No overflow menu, no three-dots, no partial rail.
 * Free: Pro destinations route to billing with feature=… (still one-tap visible).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons';
import { useEntitlements } from '@/hooks/useEntitlements';
import type { Surface } from '@/lib/thinking/types';
/** Quiet local visit count — optional; never blocks nav. */
function recordSurfaceVisitQuiet(surface: string) {
  if (typeof window === 'undefined') return;
  try {
    const KEY = 'dokkit.ux.surface_visits_v1';
    const raw = window.localStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[surface] = (map[surface] ?? 0) + 1;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export type NavSurface = Surface | 'meetings';

const ALL_ITEMS: {
  key: NavSurface;
  label: string;
  path: string;
  pro?: boolean;
}[] = [
  { key: 'today', label: 'Today', path: '/' },
  { key: 'jobs', label: 'Jobs', path: '/jobs', pro: true },
  { key: 'meetings', label: 'Meetings', path: '/meetings', pro: true },
  { key: 'travel', label: 'Travel', path: '/travel', pro: true },
];

function SectionGlyph({ surface }: { surface: NavSurface }) {
  switch (surface) {
    case 'today':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M8 3v4M16 3v4M4 10h16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'jobs':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
  const { entitlements } = useEntitlements();
  const isPro = entitlements.isPro;

  // The four lenses are Dokkit's stable map. Personalisation may change
  // emphasis elsewhere, but must not move the user's landmarks.
  const ordered = ALL_ITEMS;

  useEffect(() => {
    recordSurfaceVisitQuiet(active);
  }, [active]);

  function go(path: string, surface?: Surface) {
    if (surface && surface !== active && onNavigate) {
      onNavigate(surface);
    }
    router.push(path);
  }

  function onTab(key: NavSurface, path: string, pro?: boolean) {
    if (key === active) return;

    if (pro && !isPro) {
      const feature =
        key === 'jobs' ? 'jobs' : key === 'meetings' ? 'meetings' : 'travel';
      go(`/account/billing?feature=${feature}`);
      return;
    }

    go(path, key === 'meetings' ? undefined : (key as Surface));
  }

  return (
    <nav className="surface-nav surface-nav-tabs" aria-label="Surface navigation">
      <div className="surface-tabs" role="tablist" aria-orientation="horizontal">
        {ordered.map(({ key, label, path, pro }) => {
          const isCurrent = key === active;
          const locked = Boolean(pro && !isPro);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className={
                isCurrent
                  ? 'surface-tab current'
                  : locked
                    ? 'surface-tab locked'
                    : 'surface-tab'
              }
              aria-selected={isCurrent}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={locked ? `${label} (plan)` : label}
              onClick={() => onTab(key, path, pro)}
            >
              <span className="surface-tab-icon" aria-hidden="true">
                <SectionGlyph surface={key} />
              </span>
              <span className="surface-tab-label">{label}</span>
            </button>
          );
        })}
      </div>

      {onAdd && (
        <button
          type="button"
          className="surface-add"
          onClick={onAdd}
          aria-label={addLabel ?? 'Add'}
        >
          <PlusIcon size={20} />
        </button>
      )}
    </nav>
  );
}
