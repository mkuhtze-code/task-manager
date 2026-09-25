
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch } from '@/lib/authedFetch';
import { PLAN_COPY, resolveEntitlements, type AccountTier } from '@/lib/billing';

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tier, setTier] = useState<AccountTier>('free');
  const [billingStatus, setBillingStatus] = useState('none');
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/');
        return;
      }
      const uid = data.session.user.id;
      const { data: settings } = await supabase
        .from('user_settings')
        .select('account_tier, billing_status')
        .eq('user_id', uid)
        .maybeSingle();
      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('status, current_period_end')
        .eq('user_id', uid)
        .maybeSingle();
      if (cancelled) return;
      setTier((settings?.account_tier as AccountTier) || 'free');
      setBillingStatus(
        (settings?.billing_status as string) ||
          (sub?.status as string) ||
          'none'
      );
      setPeriodEnd((sub?.current_period_end as string) || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const ent = resolveEntitlements({ accountTier: tier, billingStatus });
  const copy = PLAN_COPY[ent.tier] || PLAN_COPY.free;

  async function startCheckout() {
    setBusy(true);
    setError('');
    try {
      const json = await authedFetch('/api/billing/checkout', {});
      if (json.url) {
        window.location.href = json.url as string;
        return;
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
      <div className="app-shell">
        <AppHeader title="Billing" backHref="/account" />
        <p className="settings-help">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Billing" backHref="/account" />

      <section className="settings-panel" style={{ marginTop: 12 }}>
        <p className="settings-panel-title">{copy.name}</p>
        <p className="settings-help" style={{ marginTop: 6 }}>
          {copy.summary}
        </p>
        {periodEnd && ent.isPro && (
          <p className="settings-help" style={{ marginTop: 8 }}>
            Current period through{' '}
            {new Date(periodEnd).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
            {ent.inBillingGrace ? ' · payment needs attention' : ''}
          </p>
        )}
      </section>

      <section className="settings-panel" style={{ marginTop: 16 }}>
        <p className="settings-help">
          Meetings requires Dokkit (paid). Today, Jobs, and Travel stay available on Free.
          Invoices and cards are managed securely by Stripe — Dokkit never stores card numbers.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {!ent.isPro && (
            <button
              type="button"
              className="btn btn-steel"
              disabled={busy}
              onClick={() => void startCheckout()}
            >
              {busy ? 'Working…' : 'Upgrade to Dokkit'}
            </button>
          )}
          {ent.isPro && ent.tier !== 'trusted_tester' && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void openPortal()}
            >
              Manage billing
            </button>
          )}
          {ent.tier === 'trusted_tester' && (
            <p className="settings-help">Trusted tester — full access without a card.</p>
          )}
        </div>
        {error && (
          <p className="settings-help" style={{ color: 'var(--danger-text, var(--danger))', marginTop: 12 }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
