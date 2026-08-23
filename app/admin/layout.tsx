'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import { AdminContext } from './AdminContext';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/waitlist', label: 'Waitlist' },
  { href: '/admin/errors', label: 'Errors' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

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

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Admin" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  if (loading || isAdmin === null) {
    return (
      <div className="app-shell">
        <AppHeader title="Admin" backHref="/" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app-shell">
        <AppHeader title="Admin" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ session }}>
      <div className="app-shell">
        <AppHeader title="Admin" backHref="/" />
        <nav
          style={{
            display: 'flex',
            gap: 4,
            marginTop: 'var(--space-4)',
            marginBottom: 'var(--space-2)',
            borderBottom: '1px solid var(--rule)',
            overflowX: 'auto',
          }}
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </AdminContext.Provider>
  );
}
