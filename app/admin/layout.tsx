'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { AdminContext } from './AdminContext';
import AdminSidebar from '@/components/admin/AdminSidebar';

// Admin shell: persistent left navigation + top chrome around an untouched
// main workspace. Authorization is enforced here (UI gate) and independently
// on every /api/admin route (the real boundary). Hiding nav items is never
// treated as a security control.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) checkAdmin();
  }, [session]);

  async function checkAdmin() {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setIsAdmin(!!adminRow);
    setLoading(false);
  }

  async function handleSignOut() {
    setSidebarOpen(false);
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!session || loading || isAdmin === null || !isAdmin) {
    const message =
      !session
        ? 'Sign in on the main page first.'
        : loading
          ? undefined
          : 'You don\u2019t have access to this page.';
    return (
      <AdminGate>
        {message && (
          <div className="adm-gate">
            <div className="adm-gate-panel">
              <div className="adm-gate-title">Dokkit Admin</div>
              <p className="adm-gate-copy">{message}</p>
            </div>
          </div>
        )}
      </AdminGate>
    );
  }

  return (
    <AdminContext.Provider value={{ session }}>
      <div className="adm-shell">
        <header className="adm-topbar">
          <div className="adm-topbar-left">
            <button
              className="adm-menu-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={sidebarOpen}
            >
              <MenuIcon />
            </button>
            <Link href="/admin" className="adm-brand">
              DOKKIT <span className="adm-brand-dim">ADMIN</span>
            </Link>
          </div>
          <div className="adm-topbar-right">
            <Link href="/" className="adm-action-link" onClick={() => setSidebarOpen(false)}>
              Open app →
            </Link>
            <span className="adm-topbar-email" title={session.user.email || undefined}>
              {session.user.email}
            </span>
            <button className="adm-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <div className="adm-body">
          <aside className={`adm-sidebar-wrap${sidebarOpen ? ' adm-sidebar-open' : ''}`}>
            <AdminSidebar pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </aside>
          <main className="adm-main">{children}</main>
        </div>

        {sidebarOpen && (
          <button className="adm-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation menu" />
        )}
      </div>
    </AdminContext.Provider>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-shell">
      <div className="adm-topbar">
        <div className="adm-topbar-left">
          <Link href="/admin" className="adm-brand">
            DOKKIT <span className="adm-brand-dim">ADMIN</span>
          </Link>
        </div>
      </div>
      <div className="adm-body">{children}</div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}