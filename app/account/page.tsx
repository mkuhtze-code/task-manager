
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

export default function Account() {
  const [session, setSession] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Account" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Account" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Signed in as</div>
        <div className="account-email mono">{session.user.email}</div>
      </div>

      <button className="btn btn-ghost account-logout-btn" onClick={handleLogOut}>
        Log out
      </button>
    </div>
  );
}
