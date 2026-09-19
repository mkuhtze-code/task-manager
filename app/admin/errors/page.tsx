'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '../AdminContext';
import { apiUrl } from '@/lib/authedFetch';

type ErrorLogRow = {
  id: string;
  source: 'server' | 'client';
  route: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  resolved: boolean;
  createdAt: string;
};

export default function ErrorLogPage() {
  const { session } = useAdminSession();
  const [items, setItems] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadErrors();
  }, [session]);

  async function loadErrors() {
    setLoading(true);
    setError('');
    const response = await fetch(apiUrl('/api/admin/errors'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Could not load error log.');
      setLoading(false);
      return;
    }
    setItems(payload.items || []);
    setLoading(false);
  }

  async function toggleResolved(id: string, current: boolean) {
    setUpdatingId(id);
    setError('');
    const response = await fetch(apiUrl('/api/admin/errors'), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, resolved: !current }),
    });
    const payload = await response.json();
    setUpdatingId(null);
    if (!response.ok) {
      setError(payload.error || 'Could not update this entry.');
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, resolved: payload.resolved } : i))
    );
  }

  if (loading) return null;

  const visibleItems = items.filter((i) => showResolved || !i.resolved);
  const unresolvedCount = items.filter((i) => !i.resolved).length;

  return (
    <>
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">
          {unresolvedCount} unresolved · {items.length} shown (last 100)
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '4px 0 8px' }}>
          Loaded through the admin API. Context is sanitized; resolve actions are audited.
        </p>
        <label className="feedback-anon-row">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          <span>Show resolved</span>
        </label>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        {visibleItems.length === 0 && !error && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing to see here.</p>
        )}
      </div>

      {visibleItems.map((item) => {
        const isOpen = expandedId === item.id;
        return (
          <div
            key={item.id}
            className={item.resolved ? 'settings-panel error-item resolved' : 'settings-panel error-item'}
          >
            <div className="error-item-top">
              <span className={`error-source-badge ${item.source}`}>{item.source}</span>
              <span className="error-route">{item.route}</span>
              <span className="error-time">
                {new Date(item.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="error-message" onClick={() => setExpandedId(isOpen ? null : item.id)}>
              {item.message}
            </p>
            {isOpen && (
              <>
                {item.context && (
                  <pre className="error-context">{JSON.stringify(item.context, null, 2)}</pre>
                )}
                {item.stack && <pre className="error-stack">{item.stack}</pre>}
              </>
            )}
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
              onClick={() => toggleResolved(item.id, item.resolved)}
              disabled={updatingId === item.id}
            >
              {updatingId === item.id
                ? 'Saving…'
                : item.resolved
                  ? 'Mark unresolved'
                  : 'Mark resolved'}
            </button>
          </div>
        );
      })}
    </>
  );
}
