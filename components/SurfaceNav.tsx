'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Surface } from '@/lib/thinking/types';
import { JobsIcon, MeetingsIcon, PlusIcon, TodayIcon, TravelIcon } from '@/components/icons';

// The four navigable places. Meetings is deliberately NOT part of the
// Gravity `Surface` union — it has its own nav entry but does not feed
// Personal Gravity's surface analysis (it is not a thought-scheduling
// surface), so the thinking engine's Surface type stays untouched.
export type NavSurface = Surface | 'meetings';

type SectionDef = { key: NavSurface; label: string; path: string };

const SECTIONS: SectionDef[] = [
  { key: 'today', label: 'Today', path: '/' },
  { key: 'jobs', label: 'Jobs', path: '/jobs' },
  { key: 'travel', label: 'Travel', path: '/travel' },
  { key: 'meetings', label: 'Meetings', path: '/meetings' },
];

function SectionGlyph({ surface }: { surface: NavSurface }) {
  switch (surface) {
    case 'today':
      return <TodayIcon />;
    case 'jobs':
      return <JobsIcon />;
    case 'travel':
      return <TravelIcon />;
    case 'meetings':
      return <MeetingsIcon />;
  }
}

// Compact bottom navigation — left, a single icon for the current section
// that expands into a quiet switcher for the other three; right, the Add
// action where each page provides one. onNavigate fires only when the user
// picks a different surface, feeding Personal Gravity (Scope 3G) with
// evidence of deliberate navigation. Meetings never fires onNavigate,
// because it is outside the Gravity surface model.
export default function SurfaceNav({
  active,
  onNavigate,
  onAdd,
  addLabel,
}: {
  active: NavSurface;
  onNavigate?: (surface: Surface) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0];
  const others = SECTIONS.filter((s) => s.key !== active);

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
            {others.map(({ key, label, path }) => (
              <button
                key={key}
                type="button"
                className="surface-menu-item"
                onClick={() => go(path, key === 'meetings' ? undefined : (key as Surface))}
              >
                <span className="surface-menu-icon">
                  <SectionGlyph surface={key} />
                </span>
                <span className="surface-menu-label">{label}</span>
              </button>
            ))}
            <button
              type="button"
              className="surface-menu-item current"
              aria-current="true"
              onClick={() => setOpen(false)}
            >
              <span className="surface-menu-icon">
                <SectionGlyph surface={active} />
              </span>
              <span className="surface-menu-label">{current.label}</span>
              <span className="surface-menu-marker" aria-hidden="true" />
            </button>
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