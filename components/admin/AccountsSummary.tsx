import Link from 'next/link';
import type { OverviewPayload } from '@/lib/admin/types';
import { formatRelative } from './format';
import AdminPanel from './AdminPanel';
import BarChart from './BarChart';

export default function AccountsSummary({ accounts, signups }: { accounts: OverviewPayload['accounts']; signups: { series: { date: string; value: number }[]; seriesLabel: string } }) {
  return (
    <AdminPanel
      wide
      title="Accounts"
      subtitle={`${accounts.total} users · ${accounts.activeUsers7d} active in the last 7 days`}
      action={<Link href="/admin/users" className="adm-action-link">Users →</Link>}
    >
      <div className="adm-accounts">
        <div className="adm-accounts-stats">
          <div className="adm-stat">
            <div className="adm-stat-value">{accounts.total}</div>
            <div className="adm-stat-label">Total users</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-value">{accounts.active}</div>
            <div className="adm-stat-label">Active accounts</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-value adm-stat-warn">{accounts.terminated}</div>
            <div className="adm-stat-label">Terminated</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-value adm-stat-warn">{accounts.notOnboarded}</div>
            <div className="adm-stat-label">Not onboarded</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-value">{accounts.newUsers7d}</div>
            <div className="adm-stat-label">New users (7d)</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-value">{accounts.newUsers30d}</div>
            <div className="adm-stat-label">New users (30d)</div>
          </div>
        </div>

        <div className="adm-accounts-body">
          <div className="adm-accounts-chart">
            <div className="adm-subheading">{signups.seriesLabel}</div>
            <BarChart series={signups.series} tone="steel" height={80} />
            <div className="adm-tier-row">
              <span className="adm-chip">Trusted tester · {accounts.byTier.trusted_tester}</span>
              <span className="adm-chip">Free · {accounts.byTier.free}</span>
              <span className="adm-chip">Premium · {accounts.byTier.premium}</span>
            </div>
          </div>

          <div className="adm-accounts-lists">
            <div>
              <div className="adm-subheading">Recent signups</div>
              {accounts.recent.length === 0 ? (
                <div className="adm-empty-note">No signups yet.</div>
              ) : (
                <ul className="adm-rows">
                  {accounts.recent.map((u) => (
                    <li key={u.id} className="adm-row">
                      <span className="adm-row-primary">{u.email || u.id.slice(0, 8)}</span>
                      <span className="adm-row-meta">{formatRelative(u.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="adm-subheading">Recent account changes</div>
              {accounts.recentChanges.length === 0 ? (
                <div className="adm-empty-note">No recent status changes.</div>
              ) : (
                <ul className="adm-rows">
                  {accounts.recentChanges.map((c) => (
                    <li key={`${c.id}-${c.updatedAt}`} className="adm-row">
                      <span className="adm-row-primary">
                        {c.email || c.id.slice(0, 8)}
                        <span className={`adm-row-badge adm-row-badge-${c.status === 'terminated' ? 'danger' : 'ok'}`}>{c.status}</span>
                      </span>
                      <span className="adm-row-meta">{formatRelative(c.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminPanel>
  );
}