'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import {
  cycleSurfacePreference,
  surfacePreferenceLabel,
} from '@/lib/surfaceMode';

type NavItem = {
  key: string;
  label: string;
  path: string;
  match: (pathname: string) => boolean;
};

const SETTINGS: NavItem[] = [
  {
    key: 'patterns',
    label: 'Patterns',
    path: '/analytics',
    match: (p) => p === '/analytics' || p.startsWith('/analytics/'),
  },
  {
    key: 'preferences',
    label: 'Preferences',
    path: '/preferences',
    match: (p) => p === '/preferences' || p.startsWith('/preferences/'),
  },
  {
    key: 'account',
    label: 'Account',
    path: '/account',
    match: (p) => p === '/account' || p.startsWith('/account/'),
  },
  {
    key: 'feedback',
    label: 'Feedback',
    path: '/feedback',
    match: (p) => p === '/feedback' || p.startsWith('/feedback/'),
  },
];

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
  } as const;
  switch (name) {
    case 'patterns':
      return (
        <svg {...common} aria-hidden>
          <path d="M4 19V5M10 19V9M16 19v-6M22 19V3" />
        </svg>
      );
    case 'preferences':
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case 'account':
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      );
    case 'feedback':
      return (
        <svg {...common} aria-hidden>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...common} aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Slim utility rail — products live in DesktopProductNav. */
export default function DesktopSidebar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { preference, setPreference } = useSurfaceMode();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;
      supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data: row }) => {
          if (!cancelled) setIsAdmin(!!row);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <aside className="desk-sidebar desk-sidebar-settings" aria-label="Settings">
      <div className="desk-sidebar-brand desk-sidebar-brand-muted">Settings</div>
      <nav className="desk-sidebar-nav">
        <div className="desk-nav-group">
          {SETTINGS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.key}
                href={item.path}
                className={`desk-nav-item${active ? ' desk-nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="desk-nav-icon" aria-hidden>
                  <Icon name={item.key} />
                </span>
                <span className="desk-nav-label">{item.label}</span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={`desk-nav-item${pathname.startsWith('/admin') ? ' desk-nav-item-active' : ''}`}
              aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            >
              <span className="desk-nav-icon" aria-hidden>
                <Icon name="admin" />
              </span>
              <span className="desk-nav-label">Admin</span>
            </Link>
          )}
        </div>
        <div className="desk-nav-group desk-nav-group-secondary">
          <button
            type="button"
            className="desk-nav-item desk-nav-item-button"
            onClick={() => setPreference(cycleSurfacePreference(preference))}
            title="Cycle layout: Auto, Desktop, Handheld"
          >
            <span className="desk-nav-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M8 20h8" />
              </svg>
            </span>
            <span className="desk-nav-label">Layout · {surfacePreferenceLabel(preference)}</span>
          </button>
          <button
            type="button"
            className="desk-nav-item desk-nav-item-button desk-nav-item-danger"
            onClick={handleLogOut}
          >
            <span className="desk-nav-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>
            <span className="desk-nav-label">Log out</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
