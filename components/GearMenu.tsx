'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// userId: when the mounting page already knows who is signed in, passing
// it here skips a redundant getSession() round-trip per mount. Optional —
// without it the menu resolves the session itself, so existing call sites
// keep working unchanged.
export default function GearMenu({
  context = 'work',
  userId,
}: {
  context?: 'work' | 'travel' | 'jobs';
  userId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (userId) {
      checkAdmin(userId);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session) checkAdmin(session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function checkAdmin(uid: string) {
    const { data } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', uid)
      .maybeSingle();
    setIsAdmin(!!data);
  }

  function placeMenu() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setMenuPos({
      top: Math.round(r.bottom + 8),
      right: Math.round(window.innerWidth - r.right),
    });
  }

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    placeMenu();
    function onReposition() {
      placeMenu();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  async function handleLogOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/');
  }

  const feedbackHref =
    context === 'travel'
      ? '/feedback?from=travel'
      : context === 'jobs'
        ? '/feedback?from=jobs'
        : '/feedback';

  const dropdown =
    menuOpen && mounted && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="gear-dropdown gear-dropdown-portal"
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              left: 'auto',
              zIndex: 400,
            }}
          >
            {pathname !== '/analytics' && pathname !== '/preferences' && (
              <>
                <Link
                  href="/analytics"
                  className="gear-dropdown-item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  Analytics
                </Link>
                <Link
                  href="/preferences"
                  className="gear-dropdown-item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  Preferences
                </Link>
              </>
            )}
            <Link
              href="/account"
              className="gear-dropdown-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Account
            </Link>
            <Link
              href={feedbackHref}
              className="gear-dropdown-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Feedback
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="gear-dropdown-item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Admin
              </Link>
            )}
            <div className="gear-dropdown-divider" />
            <button
              type="button"
              className="gear-dropdown-item destructive"
              role="menuitem"
              onClick={handleLogOut}
            >
              Log out
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="gear-menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="gear-btn"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <GearIcon />
      </button>
      {dropdown}
    </div>
  );
}
