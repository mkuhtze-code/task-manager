'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '../AdminContext';
import { apiUrl } from '@/lib/authedFetch';

type FeedbackRow = {
  id: string;
  submitterEmail: string | null;
  submitterLabel: string;
  message: string;
  isAnonymous: boolean;
  pageContext: string | null;
  createdAt: string;
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
  const [error, setError] = useState('');
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadFeedback();
  }, [session]);

  async function loadFeedback() {
    setLoading(true);
    setError('');
    const response = await fetch(apiUrl('/api/admin/feedback'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Could not load feedback.');
      setLoading(false);
      return;
    }
    setItems(payload.items || []);
    const grouped: Record<string, Reply[]> = {};
    for (const r of (payload.replies || []) as Reply[]) {
      if (!grouped[r.feedback_id]) grouped[r.feedback_id] = [];
      grouped[r.feedback_id].push(r);
    }
    setRepliesByFeedback(grouped);
    setLoading(false);
  }

  async function sendReply(feedbackId: string) {
    const text = (replyDraft[feedbackId] || '').trim();
    if (text.length === 0) return;

    setReplySending((prev) => ({ ...prev, [feedbackId]: true }));
    const response = await fetch(apiUrl('/api/admin/feedback'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ feedbackId, message: text }),
    });
    const payload = await response.json();
    setReplySending((prev) => ({ ...prev, [feedbackId]: false }));

    if (!response.ok || !payload.reply) {
      setError(payload.error || 'Could not send reply.');
      return;
    }

    setRepliesByFeedback((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] || []), payload.reply],
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
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '4px 0 0' }}>
          Loaded through the admin API. Labels are masked; full email is only kept for non-anonymous threads so you can reply.
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        {items.length === 0 && !error && (
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
              <span title={item.submitterEmail || undefined}>{item.submitterLabel}</span>
              <span>
                {new Date(item.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {item.pageContext && (
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>from {item.pageContext}</div>
            )}

            {!item.isAnonymous && (
              <div className="thread-body" style={{ marginTop: 'var(--space-2)' }}>
                {replies.map((r) => (
                  <div
                    key={r.id}
                    className={
                      r.author_type === 'admin'
                        ? 'thread-bubble thread-bubble-admin'
                        : 'thread-bubble thread-bubble-user'
                    }
                  >
                    {r.author_type === 'admin' && <div className="thread-bubble-label">You</div>}
                    <div className="thread-bubble-text">{r.message}</div>
                    <div className="thread-bubble-time">
                      {new Date(r.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}

                <div className="thread-input-row">
                  <input
                    type="text"
                    placeholder="Reply to this user…"
                    value={replyDraft[item.id] || ''}
                    onChange={(e) => setReplyDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendReply(item.id);
                    }}
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
