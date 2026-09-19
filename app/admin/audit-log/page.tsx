'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSession } from '../AdminContext';
import { apiUrl } from '@/lib/authedFetch';
import { formatRelative } from '@/components/admin/format';

const FILTERS = ['all', 'users', 'feedback', 'activity', 'overview', 'fcm', 'errors', 'audit', 'admin_access'] as const;
type FilterKey = (typeof FILTERS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  users: 'Users',
  feedback: 'Feedback',
  activity: 'Activity',
  overview: 'Overview',
  fcm: 'FCM',
  errors: 'Errors',
  audit: 'Audit',
  admin_access: 'Admin access',
};

const ACTION_LABELS: Record<string, string> = {
  'users.list': 'Listed users',
  'users.status_change': 'Changed account status',
  'feedback.list': 'Opened feedback inbox',
  'feedback.reply': 'Replied to feedback',
  'activity.list': 'Viewed activity feed',
  'overview.view': 'Viewed overview',
  'fcm.test_send': 'Sent FCM test',
  'errors.list': 'Listed errors',
  'errors.resolve': 'Toggled error resolved',
  'audit.list': 'Viewed audit log',
  'admin_access.list': 'Viewed admin membership',
};

type AuditEvent = {
  id: string;
  action: string;
  actorId: string | null;
  actorLabel: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AuditResponse = {
  events: AuditEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  filter: FilterKey;
  generatedAt: string;
};

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  const { session } = useAdminSession();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (opts: { filter: FilterKey; offset: number; append?: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          filter: opts.filter,
          offset: String(opts.offset),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(apiUrl(`/api/admin/audit-log?${params}`), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(res.status === 403 ? 'Not authorized.' : `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as AuditResponse;
        setEvents((prev) => (opts.append ? [...prev, ...payload.events] : payload.events));
        setTotal(payload.total);
        setHasMore(payload.hasMore);
        setGeneratedAt(payload.generatedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the audit log.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        inFlight.current = false;
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;
    load({ filter, offset: 0 });
  }, [session, filter, load]);

  function showMore() {
    load({ filter, offset: events.length, append: true });
  }

  function refresh() {
    load({ filter, offset: 0 });
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <div className="adm-page-title">Audit Log</div>
          <p className="adm-page-description">
            Privileged admin actions — who did what, when. Actor emails are masked.
          </p>
        </div>
        <div className="adm-page-head-right">
          <span className="adm-updated" title={generatedAt ? new Date(generatedAt).toLocaleString() : undefined}>
            {generatedAt ? `Updated ${formatClock(generatedAt)}` : ''}
          </span>
          <button
            className="adm-refresh"
            onClick={refresh}
            disabled={loading || loadingMore}
            title="Refresh now"
            aria-label="Refresh audit log"
          >
            <RefreshGlyph spinning={loading || loadingMore} />
          </button>
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="adm-chip-row" role="group" aria-label="Filter by action family">
          {FILTERS.map((key) => (
            <button
              key={key}
              className={`adm-chip adm-chip-button${filter === key ? ' adm-chip-active' : ''}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
        {!loading && (
          <span className="adm-toolbar-count">
            {total} {total === 1 ? 'event' : 'events'}
          </span>
        )}
      </div>

      {error ? (
        <div className="adm-panel">
          <h2 className="adm-panel-title">Could not load audit log</h2>
          <p className="adm-error">{error}</p>
        </div>
      ) : loading ? (
        <div className="adm-panel">
          <h2 className="adm-panel-title">Loading audit log…</h2>
          <div className="adm-loading" aria-label="Loading audit log" />
        </div>
      ) : events.length === 0 ? (
        <div className="adm-panel">
          <h2 className="adm-panel-title">No audit events yet</h2>
          <p className="adm-empty-note">
            Events appear when an admin lists users, changes status, views sensitive surfaces, or replies to feedback.
          </p>
        </div>
      ) : (
        <div className="adm-panel">
          <ul className="adm-feed">
            {events.map((e) => {
              const open = expandedId === e.id;
              return (
                <li key={e.id} className="adm-feed-item">
                  <span className="adm-feed-dot adm-feed-dot-account" aria-hidden />
                  <div className="adm-feed-body">
                    <div className="adm-feed-title">{ACTION_LABELS[e.action] || e.action}</div>
                    <div className="adm-feed-detail">
                      {e.actorLabel}
                      {e.targetType && e.targetId
                        ? ` · ${e.targetType} ${shortId(e.targetId)}`
                        : e.targetType
                          ? ` · ${e.targetType}`
                          : ''}
                      {e.metadata && typeof e.metadata.status === 'string'
                        ? ` · → ${e.metadata.status}`
                        : ''}
                    </div>
                    <div className="adm-feed-meta">
                      <span className="adm-feed-type">{e.action}</span>
                      <span>{formatRelative(e.createdAt)}</span>
                      <span>
                        {new Date(e.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {e.metadata && (
                        <button
                          type="button"
                          className="adm-action-link"
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => setExpandedId(open ? null : e.id)}
                        >
                          {open ? 'Hide detail' : 'Detail'}
                        </button>
                      )}
                    </div>
                    {open && e.metadata && (
                      <pre
                        className="error-context"
                        style={{ marginTop: 8, fontSize: 11, overflow: 'auto', maxHeight: 160 }}
                      >
                        {JSON.stringify(sanitizeMeta(e.metadata), null, 2)}
                      </pre>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button className="btn btn-ghost adm-showmore" onClick={showMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Show more (${total - events.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function sanitizeMeta(meta: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/token|secret|password|authorization/i.test(k)) out[k] = '[redacted]';
    else out[k] = v;
  }
  return out;
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function RefreshGlyph({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      style={spinning ? { animation: 'spin 0.9s linear infinite' } : undefined}
      aria-hidden
    >
      <path
        d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
