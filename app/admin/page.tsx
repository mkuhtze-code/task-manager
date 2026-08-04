'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from './layout';

type Analytics = {
  users: {
    total: number;
    byTier: { trusted_tester: number; free: number; premium: number };
    signupsByDay: Record<string, number>;
    activeUsersLast7Days: number;
  };
  feedback: { total: number; open: number; replied: number };
  waitlist: { total: number; pending: number; approved: number };
  errors: { last24h: number; last7d: number; unresolved: number };
};

export default function AdminOverview() {
  const { session } = useAdminSession();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/analytics', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      setError('Could not load analytics.');
      setLoading(false);
      return;
    }
    const json = await res.json();
    setData(json);
    setLoading(false);
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

  return (
    <>
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Users</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Total" value={data.users.total} />
          <Stat label="Active (7d)" value={data.users.activeUsersLast7Days} />
          <Stat label="Trusted testers" value={data.users.byTier.trusted_tester} />
          <Stat label="Free" value={data.users.byTier.free} />
          <Stat label="Premium" value={data.users.byTier.premium} />
        </div>
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
          <Stat label="Open" value={data.feedback.open} highlight={data.feedback.open > 0} />
          <Stat label="Replied" value={data.feedback.replied} />
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Waitlist</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Total" value={data.waitlist.total} />
          <Stat label="Pending" value={data.waitlist.pending} highlight={data.waitlist.pending > 0} />
          <Stat label="Approved" value={data.waitlist.approved} />
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Errors</div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Stat label="Last 24h" value={data.errors.last24h} highlight={data.errors.last24h > 0} />
          <Stat label="Last 7d" value={data.errors.last7d} />
          <Stat label="Unresolved" value={data.errors.unresolved} highlight={data.errors.unresolved > 0} />
        </div>
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
