'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAdminSession } from '../AdminContext';
import { apiUrl } from '@/lib/authedFetch';
import {
  ACTIVITY_FILTER_KEYS,
  ACTIVITY_WINDOW_KEYS,
  type ActivityFilterKey,
  type ActivityWindowKey,
} from '@/lib/admin/activity';
import type { ActivityEvent } from '@/lib/admin/types';
import { formatRelative } from '@/components/admin/format';

const FILTER_LABELS: Record<ActivityFilterKey, string> = {
  all: 'All',
  users: 'Users',
  product: 'Product',
  feedback: 'Feedback',
  errors: 'Errors',
};

const WINDOW_LABELS: Record<ActivityWindowKey, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

const FEED_LABELS: Record<ActivityEvent['type'], string> = {
  account: 'New account',
  account_status: 'Account status',
  feedback: 'Feedback',
  feedback_reply: 'Reply sent',
  error: 'Error',
  task_created: 'Task created',
  task_completed: 'Task completed',
  job_created: 'Job created',
  meeting_created: 'Meeting',
  trip_created: 'Trip',
};

type ActivityResponse = {
  events: ActivityEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  window: ActivityWindowKey;
  filter: ActivityFilterKey;
  generatedAt: string;
};

const PAGE_SIZE = 100;

export default function AdminActivity() {
  const { session } = useAdminSession();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<ActivityFilterKey>('all');
  const [window, setWindow] = useState<ActivityWindowKey>('7d');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const inFlight = useRef(false);

  const load = useCallback(
    async (opts: { filter: ActivityFilterKey; window: ActivityWindowKey; offset: number; append?: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          window: opts.window,
          filter: opts.filter,
          offset: String(opts.offset),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(apiUrl(`/api/admin/activity?${params}`), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(res.status === 403 ? 'Not authorized.' : `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as ActivityResponse;
        setEvents((prev) => (opts.append ? [...prev, ...payload.events] : payload.events));
        setTotal(payload.total);
        setHasMore(payload.hasMore);
        setGeneratedAt(payload.generatedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load activity.');
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
    load({ filter, window, offset: 0 });
  }, [session, filter, window, load]);

  function showMore() {
    load({ filter, window, offset: events.length, append: true });
  }

  function refresh() {
    load({ filter, window, offset: 0 });
  }

  function switchFilter(next: ActivityFilterKey) {
    if (next === filter) return;
    setFilter(next);
  }

  function switchWindow(next: ActivityWindowKey) {
    if (next === window) return;
    setWindow(next);
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <div className="adm-page-title">Activity</div>
          <p className="adm-page-description">A chronological log of what has been happening across Dokkit.</p>
        </div>
        <div className="adm-page-head-right">
          <div className="adm-chip-row" role="group" aria-label="Time window">
            {ACTIVITY_WINDOW_KEYS.map((key) => (
              <button
                key={key}
                className={`adm-chip adm-chip-button${window === key ? ' adm-chip-active' : ''}`}
                onClick={() => switchWindow(key)}
                aria-pressed={window === key}
              >
                {WINDOW_LABELS[key]}
              </button>
            ))}
          </div>
          <span className="adm-updated" title={generatedAt ? new Date(generatedAt).toLocaleString() : undefined}>
            {generatedAt ? `Updated ${formatClock(generatedAt)}` : ''}
          </span>
          <button
            className="adm-refresh"
            onClick={refresh}
            disabled={loading || loadingMore}
            title="Refresh now"
            aria-label="Refresh activity"
          >
            <RefreshGlyph spinning={loading || loadingMore} />
          </button>
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="adm-chip-row" role="group" aria-label="Filter by category">
          {ACTIVITY_FILTER_KEYS.map((key) => (
            <button
              key={key}
              className={`adm-chip adm-chip-button${filter === key ? ' adm-chip-active' : ''}`}
              onClick={() => switchFilter(key)}
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
          <h2 className="adm-panel-title">Could not load activity</h2>
          <p className="adm-error">{error}</p>
        </div>
      ) : loading ? (
        <div className="adm-panel">
          <h2 className="adm-panel-title">Loading activity…</h2>
          <div className="adm-loading" aria-label="Loading activity" />
        </div>
      ) : events.length === 0 ? (
        <div className="adm-panel">
          <h2 className="adm-panel-title">No activity in this window</h2>
          <p className="adm-empty-note">Nothing happened across the surfaces in this period.</p>
        </div>
      ) : (
        <div className="adm-panel">
          <ul className="adm-feed">
            {events.map((e) => (
              <li key={e.id} className="adm-feed-item">
                <span className={`adm-feed-dot adm-feed-dot-${e.type}`} aria-hidden />
                <div className="adm-feed-body">
                  <div className="adm-feed-title">{e.title}</div>
                  {e.detail && <div className="adm-feed-detail">{e.detail}</div>}
                  <div className="adm-feed-meta">
                    <span className="adm-feed-type">{FEED_LABELS[e.type]}</span>
                    <span>{formatRelative(e.timestamp)}</span>
                    <span>{new Date(e.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                </div>
                {e.href && (
                  <Link href={e.href} className="adm-feed-link" aria-label={`Open ${FEED_LABELS[e.type]}`}>
                    →
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              className="btn btn-ghost adm-showmore"
              onClick={showMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : `Show more (${total - events.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
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
      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}