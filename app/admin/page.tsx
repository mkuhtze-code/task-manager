'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminSession } from './AdminContext';
import { apiUrl } from '@/lib/authedFetch';

type Analytics = {
  status: 'healthy' | 'watch' | 'attention';
  attention: { level: 'warning' | 'critical'; label: string; detail: string }[];
  recentUnresolvedErrors: { id: string; source: string; route: string; message: string; createdAt: string }[];
  users: {
    total: number;
    byTier: { trusted_tester: number; free: number; premium: number };
    signupsByDay: Record<string, number>;
    activeUsersLast7Days: number;
    notOnboarded: number;
  };
  feedback: { total: number; open: number; replied: number };
  errors: { last24h: number; last7d: number; unresolved: number };
};

export default function AdminOverview() {
  const { session } = useAdminSession();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/admin/analytics'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError('Could not load the dashboard.');
        return;
      }
      setData(await res.json());
    } catch {
      setError('Could not reach the dashboard.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <p style={{ fontSize: 13, color: 'var(--hazard)', margin: 0 }}>{error || 'No data.'}</p>
      </div>
    );
  }

  const signupDays = Object.keys(data.users.signupsByDay).sort();
  const maxSignups = Math.max(1, ...Object.values(data.users.signupsByDay));
  const statusCopy = {
    healthy: { title: 'Looks healthy', detail: 'Nothing currently needs your attention.' },
    watch: { title: 'Worth a look', detail: 'Dokkit is running, but there are a few things waiting for you.' },
    attention: { title: 'Needs attention', detail: 'Something is going wrong and should be checked.' },
  }[data.status];

  return (
    <>
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <div>
            <div className="settings-panel-title">System</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{statusCopy.title}</div>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{statusCopy.detail}</p>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: data.status === 'healthy' ? 'var(--ink-soft)' : 'var(--hazard)',
            }}
          >
            {data.status}
          </span>
        </div>
      </div>

      {data.attention.length > 0 && (
        <div className="settings-panel">
          <div className="settings-panel-title">Needs attention</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 'var(--space-2)' }}>
            {data.attention.map((item) => (
              <div
                key={`${item.level}-${item.label}`}
                style={{
                  borderLeft: `3px solid ${item.level === 'critical' ? 'var(--hazard)' : 'var(--rule)'}`,
                  paddingLeft: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="settings-panel">
        <div className="settings-panel-title">Users</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Total" value={data.users.total} />
          <Stat label="Active (7d)" value={data.users.activeUsersLast7Days} />
          <Stat label="Not onboarded" value={data.users.notOnboarded} highlight={data.users.notOnboarded > 0} />
          <Stat label="Trusted testers" value={data.users.byTier.trusted_tester} />
          <Stat label="Free" value={data.users.byTier.free} />
          <Stat label="Premium" value={data.users.byTier.premium} />
        </div>
        <Link href="/admin/users" style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
          Manage users →
        </Link>
      </div>

      {signupDays.length > 0 && (
        <div className="settings-panel">
          <div className="settings-panel-title">Signups — last 30 days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginTop: 'var(--space-2)' }}>
            {signupDays.map((day) => (
              <div
                key={day}
                title={`${day}: ${data.users.signupsByDay[day]}`}
                style={{
                  flex: 1,
                  minWidth: 4,
                  height: `${(data.users.signupsByDay[day] / maxSignups) * 100}%`,
                  background: 'var(--cobalt)',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="settings-panel">
        <div className="settings-panel-title">Feedback</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Total" value={data.feedback.total} />
          <Stat label="Waiting" value={data.feedback.open} highlight={data.feedback.open > 0} />
          <Stat label="Replied" value={data.feedback.replied} />
        </div>
        {data.feedback.open > 0 && (
          <Link href="/admin/feedback" style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
            Read feedback →
          </Link>
        )}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Errors</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Last 24h" value={data.errors.last24h} highlight={data.errors.last24h > 0} />
          <Stat label="Last 7d" value={data.errors.last7d} />
          <Stat label="Unresolved" value={data.errors.unresolved} highlight={data.errors.unresolved > 0} />
        </div>
        {data.recentUnresolvedErrors.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            {data.recentUnresolvedErrors.map((item) => (
              <Link
                key={item.id}
                href="/admin/errors"
                style={{ textDecoration: 'none', color: 'inherit', borderTop: '1px solid var(--rule)', paddingTop: 8 }}
              >
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--ink-faint)' }}>
                  <span>{item.source}</span><span>{item.route}</span>
                  <span style={{ marginLeft: 'auto' }}>{formatTime(item.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 3 }}>{item.message}</div>
              </Link>
            ))}
          </div>
        )}
        <Link href="/admin/errors" style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
          Open error log →
        </Link>
      </div>
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ minWidth: 70 }}>
      <div
        style={{
          fontFamily: 'var(--font-digital, monospace)',
          fontSize: 24,
          fontWeight: 700,
          color: highlight ? 'var(--hazard)' : 'var(--ink)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{label}</div>
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
