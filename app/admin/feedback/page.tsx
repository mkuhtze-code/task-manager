'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAdminSession } from '../layout';

type FeedbackRow = {
  id: string;
  submitter_email: string | null;
  message: string;
  is_anonymous: boolean;
  page_context: string | null;
  created_at: string;
};

type Reply = {
  id: string;
  feedback_id: string;
  author_type: 'user' | 'admin';
  message: string;
  created_at: string;
};

export default function FeedbackInbox() {
  const { session } = useAdminSession();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [repliesByFeedback, setRepliesByFeedback] = useState<Record<string, Reply[]>>({});
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadFeedback();
  }, []);

  async function loadFeedback() {
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data || []);

    if (data && data.length > 0) {
      const ids = data.map((i) => i.id);
      const { data: replies } = await supabase
        .from('feedback_replies')
        .select('*')
        .in('feedback_id', ids)
        .order('created_at', { ascending: true });
      const grouped: Record<string, Reply[]> = {};
      (replies || []).forEach((r) => {
        if (!grouped[r.feedback_id]) grouped[r.feedback_id] = [];
        grouped[r.feedback_id].push(r);
      });
      setRepliesByFeedback(grouped);
    }
    setLoading(false);
  }

  async function sendReply(feedbackId: string) {
    const text = (replyDraft[feedbackId] || '').trim();
    if (text.length === 0) return;

    setReplySending((prev) => ({ ...prev, [feedbackId]: true }));
    const { data, error } = await supabase
      .from('feedback_replies')
      .insert({
        feedback_id: feedbackId,
        author_type: 'admin',
        author_id: session.user.id,
        message: text,
      })
      .select()
      .single();
    setReplySending((prev) => ({ ...prev, [feedbackId]: false }));

    if (error || !data) return;

    setRepliesByFeedback((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] || []), data],
    }));
    setReplyDraft((prev) => ({ ...prev, [feedbackId]: '' }));
  }

  if (loading) return null;

  return (
    <>
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">
          {items.length} {items.length === 1 ? 'message' : 'messages'}
        </div>
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing yet.</p>
        )}
      </div>

      {items.map((item) => {
        const replies = repliesByFeedback[item.id] || [];
        return (
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

            {!item.is_anonymous && (
              <div className="thread-body" style={{ marginTop: 'var(--space-2)' }}>
                {replies.map((r) => (
                  <div
                    key={r.id}
                    className={r.author_type === 'admin' ? 'thread-bubble thread-bubble-admin' : 'thread-bubble thread-bubble-user'}
                  >
                    {r.author_type === 'admin' && <div className="thread-bubble-label">You</div>}
                    <div className="thread-bubble-text">{r.message}</div>
                    <div className="thread-bubble-time">
                      {new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                ))}

                <div className="thread-input-row">
                  <input
                    type="text"
                    placeholder="Reply to this user…"
                    value={replyDraft[item.id] || ''}
                    onChange={(e) => setReplyDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendReply(item.id); }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
                    onClick={() => sendReply(item.id)}
                    disabled={replySending[item.id]}
                  >
                    {replySending[item.id] ? '…' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
