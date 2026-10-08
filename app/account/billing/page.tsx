'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch, authedGet } from '@/lib/authedFetch';
import type { BillingInvoiceRow, BillingSummary, ProFeature } from '@/lib/billing';
import { PRO_FEATURE_COPY } from '@/lib/billing';
import {
  buildStorageQuota,
  formatStorageBytes,
  formatStoragePercent,
} from '@/lib/storageQuota';

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function formatInvoiceDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const featureParam = searchParams.get('feature') as ProFeature | null;
  const highlightFeature =
    featureParam && featureParam in PRO_FEATURE_COPY
      ? featureParam
      : null;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [invoicesError, setInvoicesError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace('/');
      return;
    }
    setLoading(true);
    setError('');
    const [sumRes, invRes] = await Promise.all([
      authedGet<BillingSummary & { error?: string }>('/api/billing/summary'),
      authedGet<{ invoices?: BillingInvoiceRow[]; error?: string }>(
        '/api/billing/invoices'
      ),
    ]);
    if (!sumRes.ok) {
      setError(sumRes.data?.error || 'Could not load billing details');
      setSummary(null);
    } else {
      setSummary(sumRes.data as BillingSummary);
    }
    if (invRes.ok) {
      setInvoices(invRes.data.invoices || []);
      setInvoicesError('');
    } else {
      setInvoices([]);
      setInvoicesError(invRes.data?.error || 'Could not load invoices');
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startCheckout() {
    setBusy(true);
    setError('');
    try {
      const json = await authedFetch('/api/billing/checkout', {});
      if (json.url) {
        window.location.href = json.url as string;
        return;
      }
      // Already subscribed / entitled — open Customer Portal instead
      if (json.code === 'already_subscribed' || json.code === 'already_entitled' || json.usePortal) {
        const portal = await authedFetch('/api/billing/portal', {});
        if (portal.url) {
          window.location.href = portal.url as string;
          return;
        }
      }
      setError(json.error || 'Could not start checkout');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout');
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setError('');
    try {
      const json = await authedFetch('/api/billing/portal', {});
      if (json.url) {
        window.location.href = json.url as string;
        return;
      }
      setError(json.error || 'Could not open billing portal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell account-portal">
        <AppHeader title="Billing" backHref="/account" />
        <p className="account-muted">Loading billing…</p>
      </div>
    );
  }

  const s = summary;
  const periodLabel = formatPeriodEnd(s?.currentPeriodEnd ?? null);
  const quota = s
    ? buildStorageQuota(s.storageUsedBytes, s.storageLimitBytes)
    : null;
  const showUpgrade = s && !s.isPro && s.tier !== 'trusted_tester';
  const showPortal =
    s && s.hasStripeCustomer && s.tier !== 'trusted_tester';

  return (
    <div className="app-shell account-portal">
      <AppHeader title="Billing" backHref="/account" />

      {error && (
        <p className="account-alert" role="alert">
          {error}
        </p>
      )}

      {/* Why upgrade — when arriving from a Pro surface */}
      {!s?.isPro && (
        <section className="account-card" aria-labelledby="included-heading">
          <p className="account-card-kicker">Dokkit plan</p>
          <h2 id="included-heading" className="account-card-title">
            {highlightFeature
              ? PRO_FEATURE_COPY[highlightFeature].title
              : 'What Dokkit includes'}
          </h2>
          {highlightFeature ? (
            <p className="account-muted">{PRO_FEATURE_COPY[highlightFeature].body}</p>
          ) : (
            <p className="account-muted">
              Expand beyond Today with surfaces that keep work, conversations, and time
              away in one place.
            </p>
          )}
          <ul className="billing-feature-list">
            {(Object.keys(PRO_FEATURE_COPY) as ProFeature[]).map((key) => (
              <li
                key={key}
                className={
                  highlightFeature === key
                    ? 'billing-feature-item is-highlight'
                    : 'billing-feature-item'
                }
              >
                <span className="billing-feature-name">{PRO_FEATURE_COPY[key].title}</span>
                <span className="billing-feature-desc">{PRO_FEATURE_COPY[key].body}</span>
              </li>
            ))}
          </ul>
          <p className="account-muted" style={{ marginTop: 12 }}>
            Free keeps Today, tasks, and Reality Check. Pricing is confirmed at checkout.
            {' '}
            <a
              href="https://dokkit.space"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-text"
            >
              Learn more on dokkit.space
            </a>
          </p>
        </section>
      )}

      {/* Plan */}
      <section className="account-card" aria-labelledby="plan-heading">
        <p className="account-card-kicker">Current plan</p>
        <h2 id="plan-heading" className="account-card-title">
          {s?.planName ?? '—'}
        </h2>
        <p className="account-muted">{s?.planSummary}</p>

        <dl className="account-dl">
          <div>
            <dt>Status</dt>
            <dd>
              {s?.tier === 'trusted_tester'
                ? 'Trusted tester'
                : s?.subscriptionStatus || s?.billingStatus || 'none'}
              {s?.cancelAtPeriodEnd ? ' · ends after this period' : ''}
              {s?.billingStatus === 'past_due' ? ' · payment needs attention' : ''}
            </dd>
          </div>
          {s?.priceDisplay && (
            <div>
              <dt>Price</dt>
              <dd>
                {s.priceDisplay}
                {s.interval ? ` / ${s.interval}` : ''}
              </dd>
            </div>
          )}
          {periodLabel && s?.isPro && s.tier !== 'trusted_tester' && (
            <div>
              <dt>{s.cancelAtPeriodEnd ? 'Access until' : 'Next renewal'}</dt>
              <dd>{periodLabel}</dd>
            </div>
          )}
        </dl>

        <div className="account-actions">
          {showUpgrade && (
            <button
              type="button"
              className="btn btn-steel"
              disabled={busy || !s?.stripeConfigured}
              onClick={() => void startCheckout()}
            >
              {busy ? 'Working…' : 'Upgrade to Dokkit'}
            </button>
          )}
          {showPortal && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void openPortal()}
            >
              Manage billing
            </button>
          )}
          {s?.tier === 'trusted_tester' && (
            <p className="account-muted">Full access without a card.</p>
          )}
          {showUpgrade && s && !s.stripeConfigured && (
            <p className="account-muted">Billing is not configured on this environment.</p>
          )}
        </div>
      </section>

      {/* Payment method */}
      <section className="account-card" aria-labelledby="pm-heading">
        <h2 id="pm-heading" className="account-card-heading">
          Payment method
        </h2>
        {s?.paymentMethod?.last4 ? (
          <p className="account-body">
            {[s.paymentMethod.brand, '····', s.paymentMethod.last4]
              .filter(Boolean)
              .join(' ')}
            {s.paymentMethod.expMonth && s.paymentMethod.expYear
              ? ` · exp ${s.paymentMethod.expMonth}/${s.paymentMethod.expYear}`
              : ''}
          </p>
        ) : (
          <p className="account-muted">
            {s?.hasStripeCustomer
              ? 'No default card on file. Use Manage billing to add one.'
              : 'No payment method — only needed if you subscribe.'}
          </p>
        )}
        {showPortal && (
          <button
            type="button"
            className="btn-text account-inline-action"
            disabled={busy}
            onClick={() => void openPortal()}
          >
            Update payment method
          </button>
        )}
      </section>

      {/* Storage */}
      {quota && (
        <section className="account-card" aria-labelledby="storage-heading">
          <h2 id="storage-heading" className="account-card-heading">
            Storage
          </h2>
          <p className="account-body">
            {formatStorageBytes(quota.usedBytes)} of{' '}
            {formatStorageBytes(quota.limitBytes)} used (
            {formatStoragePercent(quota.ratio)})
          </p>
          <div
            className="account-meter"
            role="progressbar"
            aria-valuenow={Math.round(quota.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="account-meter-fill"
              style={{ width: `${Math.min(100, quota.ratio * 100)}%` }}
            />
          </div>
        </section>
      )}

      {/* Invoices */}
      <section className="account-card" aria-labelledby="inv-heading">
        <h2 id="inv-heading" className="account-card-heading">
          Invoices
        </h2>
        {invoicesError && (
          <p className="account-muted" role="status">
            {invoicesError}
          </p>
        )}
        {!invoicesError && invoices.length === 0 && (
          <p className="account-muted">No invoices yet.</p>
        )}
        {invoices.length > 0 && (
          <ul className="account-invoice-list">
            {invoices.map((inv) => (
              <li key={inv.id} className="account-invoice-row">
                <div>
                  <span className="account-invoice-date">
                    {formatInvoiceDate(inv.created)}
                  </span>
                  <span className="account-muted">
                    {' '}
                    · {inv.number || inv.status || 'Invoice'}
                  </span>
                </div>
                <div className="account-invoice-right">
                  <span className="account-invoice-amount">
                    {formatMoney(inv.amountPaid, inv.currency)}
                  </span>
                  {(inv.pdfUrl || inv.hostedUrl) && (
                    <a
                      href={inv.pdfUrl || inv.hostedUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-text"
                    >
                      View
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="account-footnote">
        Card details are handled by Stripe. Dokkit does not store full card numbers.{' '}
        <Link href="/account">Back to account</Link>
      </p>
    </div>
  );
}


export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell account-portal">
          <AppHeader title="Billing" backHref="/account" />
          <p className="account-muted">Loading billing…</p>
        </div>
      }
    >
      <BillingPageInner />
    </Suspense>
  );
}
