'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.48-.41h-3.84a.5.5 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.74 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z" />
    </svg>
  );
}

export default function GearMenu({ context = 'work' }: { context?: 'work' | 'travel' }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return;
    const { data } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setIsAdmin(!!data);
  }

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

  const feedbackHref = `/feedback?from=${encodeURIComponent(pathname || '/')}`;

  return (
    <div className="gear-menu-wrap" ref={menuRef} onClick={(e) => e.stopPropagation()}>
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
          {context === 'work' && (
            <>
              <Link href="/analytics" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
                Patterns
              </Link>
              <Link href="/preferences" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
                Preferences
              </Link>
            </>
          )}
          <Link href="/account" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
            Account
          </Link>
          <Link href={feedbackHref} className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
            Send Feedback
          </Link>
          {isAdmin && (
            <Link href="/admin" className="gear-dropdown-item" onClick={() => setMenuOpen(false)}>
              Admin
            </Link>
          )}
          <div className="gear-dropdown-divider" />
          <button className="gear-dropdown-item destructive" onClick={handleLogOut}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
