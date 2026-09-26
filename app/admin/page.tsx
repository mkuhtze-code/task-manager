'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSession } from './AdminContext';
import { apiUrl } from '@/lib/authedFetch';
import type { OverviewPayload } from '@/lib/admin/types';
import AdminMetric from '@/components/admin/AdminMetric';
import AdminPanel from '@/components/admin/AdminPanel';
import AccountsSummary from '@/components/admin/AccountsSummary';
import ProductSummary from '@/components/admin/ProductSummary';
import UsageOverview from '@/components/admin/UsageOverview';
import SystemHealth from '@/components/admin/SystemHealth';
import AttentionPanel from '@/components/admin/AttentionPanel';
import ActivityFeed from '@/components/admin/ActivityFeed';
import SupportSummary from '@/components/admin/SupportSummary';
import BusinessStatus from '@/components/admin/BusinessStatus';
import InfrastructureSummary from '@/components/admin/InfrastructureSummary';
import BarChart from '@/components/admin/BarChart';
import StatusIndicator from '@/components/admin/StatusIndicator';

// Server data comes in as the raw system state; we map the overall page
// status onto one of the shared SystemState values for the badge.
const OVERALL_TO_STATE = {
  operational: 'operational',
  attention: 'warning',
  critical: 'error',
} as const;

export default function AdminOverview() {
  const { session } = useAdminSession();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (opts: { background?: boolean } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (opts.background) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const res = await fetch(apiUrl('/api/admin/overview'), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(res.status === 403 ? 'Not authorized.' : `Request failed (${res.status})`);
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the dashboard.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        inFlight.current = false;
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;

    load();

    const startTimer = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => load({ background: true }), 60_000);
    };
    const pauseTimer = () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseTimer();
      } else {
        load({ background: true });
        startTimer();
      }
    };

    if (document.visibilityState === 'hidden') pauseTimer();
    else startTimer();

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      pauseTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session, load]);

  if (!data) {
    return (
      <div className="adm-page">
        <div className="adm-page-head">
          <div>
            <div className="adm-page-title">Overview</div>
            <p className="adm-page-description">System-wide view</p>
          </div>
        </div>
        <AdminPanel title={error ? 'Could not load the overview' : 'Loading the overview…'}>
          {error && <p className="adm-error">{error}</p>}
          {!error && <div className="adm-loading" aria-label="Loading overview" />}
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <div className="adm-page-title">Overview</div>
          <p className="adm-page-description">System-wide view</p>
        </div>
        <div className="adm-page-head-right">
          <StatusIndicator state={OVERALL_TO_STATE[data.overall]} label={data.overallLabel} />
          <span className="adm-updated" title={new Date(data.generatedAt).toLocaleString()}>
            Updated {formatClock(data.generatedAt)}
          </span>
          <button
            className="adm-refresh"
            onClick={() => load({ background: true })}
            disabled={refreshing || loading}
            title="Refresh now"
          >
            <RefreshGlyph spinning={refreshing} />
          </button>
        </div>
      </div>

      {(data.attention.length > 0 || loading) && (
        <p className={data.overall === 'operational' ? 'adm-page-detail' : `adm-page-detail adm-page-detail-${data.overall}`}>
          {data.overallDetail}
        </p>
      )}

      <div className="adm-top-banner">
        {data.topMetrics.map((m) => (
          <AdminMetric key={m.key} metric={m} />
        ))}
      </div>

      <div className="adm-grid adm-grid-7-5">
        <SystemHealth components={data.system.components} />
        <AttentionPanel items={data.attention} />
      </div>

      <AccountsSummary accounts={data.accounts} signups={{ series: data.signups.series, seriesLabel: data.signups.seriesLabel }} />

      <div className="adm-grid adm-grid-7-5">
        <ActivityFeed events={data.activity} />
        <div className="adm-col-stack">
          <SupportSummary feedback={data.feedback} />
          <BusinessStatus />
        </div>
      </div>

      <ProductSummary areas={data.productAreas} />
      <UsageOverview areas={data.productAreas} surfaces={data.surfaces} />

      <div className="adm-grid adm-grid-charts">
        <AdminPanel title="Errors — last 14 days" subtitle="Recorded server and client errors by day">
          <BarChart series={data.errorsByDay.series} tone="hazard" height={84} emptyLabel="No errors recorded in the last 14 days" />
        </AdminPanel>
        <AdminPanel title={data.signups.seriesLabel} subtitle="Accounts created per day">
          <BarChart series={data.signups.series} tone="moss" height={84} emptyLabel="No signups in the last 30 days" />
        </AdminPanel>
      </div>

      <InfrastructureSummary items={data.infrastructure} />

      {data.limitations.length > 0 && (
        <AdminPanel title="Measurement notes" subtitle="What is and is not currently measured">
          <ul className="adm-notes">
            {data.limitations.map((l, i) => (
              <li key={i} className="adm-note">{l}</li>
            ))}
          </ul>
        </AdminPanel>
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
