'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
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

  // Place the menu in the browser top layer so sticky app chrome cannot cover it.
  useLayoutEffect(() => {
    if (!menuOpen || !menuPos) return;
    const menu = menuRef.current;
    if (!menu) return;
    try {
      if (!menu.matches(':popover-open')) menu.showPopover();
    } catch {
      // Older WebViews still use the maximum fixed z-index from the portal.
    }
  }, [menuOpen, menuPos]);

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
            popover="manual"
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              bottom: 'auto',
              left: 'auto',
              margin: 0,
              zIndex: 2147483647,
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
