'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  JobsIcon,
  MeetingsIcon,
  PlusIcon,
  TodayIcon,
  TravelIcon,
} from '@/components/icons';
import type { NavSurface } from '@/components/SurfaceNav';
import { requestCaptureOpen } from '@/lib/captureOpen';

type NavItem = {
  key: NavSurface | 'patterns';
  label: string;
  path: string;
  match: (pathname: string) => boolean;
};

const PRIMARY: NavItem[] = [
  {
    key: 'today',
    label: 'Today',
    path: '/',
    match: (p) => p === '/' || p === '',
  },
  {
    key: 'jobs',
    label: 'Jobs',
    path: '/jobs',
    match: (p) => p === '/jobs' || p.startsWith('/jobs/'),
  },
  {
    key: 'travel',
    label: 'Travel',
    path: '/travel',
    match: (p) => p === '/travel' || p.startsWith('/travel/'),
  },
  {
    key: 'meetings',
    label: 'Meetings',
    path: '/meetings',
    match: (p) => p === '/meetings' || p.startsWith('/meetings/'),
  },
];

const SECONDARY: NavItem[] = [
  {
    key: 'patterns',
    label: 'Patterns',
    path: '/analytics',
    match: (p) => p === '/analytics' || p.startsWith('/analytics/'),
  },
];

function Glyph({ surface }: { surface: NavItem['key'] }) {
  switch (surface) {
    case 'today':
      return <TodayIcon />;
    case 'jobs':
      return <JobsIcon />;
    case 'travel':
      return <TravelIcon />;
    case 'meetings':
      return <MeetingsIcon />;
    case 'patterns':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 19V5" />
          <path d="M10 19V9" />
          <path d="M16 19v-6" />
          <path d="M22 19V3" />
        </svg>
      );
  }
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  return (
    <Link
      href={item.path}
      className={`desk-nav-item${active ? ' desk-nav-item-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="desk-nav-icon" aria-hidden>
        <Glyph surface={item.key} />
      </span>
      <span className="desk-nav-label">{item.label}</span>
    </Link>
  );
}

/**
 * Persistent left rail for desktop surface mode.
 */
export default function DesktopSidebar() {
  const pathname = usePathname() || '/';
  const path = pathname;
  const onToday = path === '/' || path === '';

  return (
    <aside className="desk-sidebar" aria-label="Main navigation">
      <div className="desk-sidebar-brand">Dokkit</div>
      <nav className="desk-sidebar-nav">
        <div className="desk-nav-group">
          {PRIMARY.map((item) => (
            <NavLink key={item.key} item={item} pathname={path} />
          ))}
        </div>
        <div className="desk-nav-group desk-nav-group-secondary">
          {SECONDARY.map((item) => (
            <NavLink key={item.key} item={item} pathname={path} />
          ))}
        </div>
      </nav>
      {onToday && (
        <div className="desk-sidebar-dock">
          <button
            type="button"
            className="btn btn-steel"
            onClick={() => requestCaptureOpen()}
          >
            <PlusIcon size={16} /> Dock it
          </button>
        </div>
      )}
    </aside>
  );
}
