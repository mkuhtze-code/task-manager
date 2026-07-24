
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function GearIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10a1.65 1.65 0 0 0 1-1.51V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H20a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AppHeader({
  title,
  dateLabel,
  backHref,
}: {
  title: string;
  dateLabel?: string;
  backHref?: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  async function handleLogOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="app-header">
      <div className="app-header-left">
        {backHref && (
          <Link href={backHref} className="back-link" aria-label="Back">
            ‹
          </Link>
        )}
        <h1 className="app-title">{title}</h1>
      </div>
      <div className="app-header-right" ref={menuRef}>
        {dateLabel && <div className="app-date">{dateLabel}</div>}
        <button
          className="gear-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <GearIcon />
        </button>
        {menuOpen && (
          <div className="gear-dropdown">
            <Link href="/preferences" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
              Preferences
            </Link>
            <Link href="/account" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
              Account
            </Link>
            <div className="gear-dropdown-divider" />
            <button className="gear-dropdown-item destructive" onClick={handleLogOut}>
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
