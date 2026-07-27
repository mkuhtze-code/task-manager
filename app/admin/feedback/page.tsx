
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

type FeedbackRow = {
  id: string;
  submitter_email: string | null;
  message: string;
  is_anonymous: boolean;
  page_context: string | null;
  created_at: string;
};

export default function FeedbackInbox() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) checkAdminAndLoad();
  }, [session]);

  async function checkAdminAndLoad() {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const admin = !!adminRow;
    setIsAdmin(admin);

    if (admin) {
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      setItems(data || []);
    }
    setLoading(false);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Feedback Inbox" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  if (loading || isAdmin === null) {
    return (
      <div className="app-shell">
        <AppHeader title="Feedback Inbox" backHref="/" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app-shell">
        <AppHeader title="Feedback Inbox" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Feedback Inbox" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">
          {items.length} {items.length === 1 ? 'message' : 'messages'}
        </div>
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing yet.</p>
        )}
      </div>

      {items.map((item) => (
        <div key={item.id} className="settings-panel feedback-item">
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {item.message}
          </p>
          <div className="feedback-meta">
            <span>{item.is_anonymous ? 'Anonymous' : item.submitter_email || 'Unknown'}</span>
            <span>
              {new Date(item.created_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
          {item.page_context && (
            <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>from {item.page_context}</div>
          )}
        </div>
      ))}
    </div>
  );
}
