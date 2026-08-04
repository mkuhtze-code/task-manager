'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ErrorLogRow = {
  id: string;
  source: 'server' | 'client';
  route: string;
  message: string;
  stack: string | null;
  context: any;
  resolved: boolean;
  created_at: string;
};

export default function ErrorLogPage() {
  const [items, setItems] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadErrors();
  }, []);

  async function loadErrors() {
    const { data } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems(data || []);
    setLoading(false);
  }

  async function toggleResolved(id: string, current: boolean) {
    await supabase.from('error_logs').update({ resolved: !current }).eq('id', id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: !current } : i)));
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
        <label className="feedback-anon-row">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          <span>Show resolved</span>
        </label>
        {visibleItems.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing to see here.</p>
        )}
      </div>

      {visibleItems.map((item) => {
        const isOpen = expandedId === item.id;
        return (
          <div key={item.id} className={item.resolved ? 'settings-panel error-item resolved' : 'settings-panel error-item'}>
            <div className="error-item-top">
              <span className={`error-source-badge ${item.source}`}>{item.source}</span>
              <span className="error-route">{item.route}</span>
              <span className="error-time">
                {new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <p className="error-message" onClick={() => setExpandedId(isOpen ? null : item.id)}>
              {item.message}
            </p>
            {isOpen && (
              <>
                {item.context && <pre className="error-context">{JSON.stringify(item.context, null, 2)}</pre>}
                {item.stack && <pre className="error-stack">{item.stack}</pre>}
              </>
            )}
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
              onClick={() => toggleResolved(item.id, item.resolved)}
            >
              {item.resolved ? 'Mark unresolved' : 'Mark resolved'}
            </button>
          </div>
        );
      })}
    </>
  );
}
