'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { apiUrl, authedGet } from '@/lib/authedFetch';
import AppHeader from '@/components/AppHeader';
import {
  buildStorageQuota,
  formatStorageBytes,
  formatStoragePercent,
  type StorageQuota,
} from '@/lib/storageQuota';
import type { AccountTier, BillingSummary } from '@/lib/billing';

type Section = 'profile' | 'plan' | 'security' | 'storage' | 'data';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'plan', label: 'Plan & billing' },
  { id: 'security', label: 'Security' },
  { id: 'storage', label: 'Storage' },
  { id: 'data', label: 'Data' },
];

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [section, setSection] = useState<Section>('profile');

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [accountTier, setAccountTier] = useState<AccountTier | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('account_tier, storage_used_bytes, storage_limit_bytes')
        .eq('user_id', session.user.id)
        .maybeSingle();
      setAccountTier((data?.account_tier as AccountTier) || 'free');
      if (data) {
        setStorageQuota(
          buildStorageQuota(
            Number(data.storage_used_bytes ?? 0),
            Number(data.storage_limit_bytes ?? 0) || 30 * 1024 * 1024 * 1024
          )
        );
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!session || section !== 'plan') return;
    let cancelled = false;
    setBillingLoading(true);
    authedGet<BillingSummary>('/api/billing/summary').then((res) => {
      if (cancelled) return;
      if (res.ok) setBillingSummary(res.data);
      setBillingLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, section]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSInstructions((v) => !v);
    }
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function exportData() {
    if (!session) return;
    setExporting(true);
    setExportError('');
    try {
      const userId = session.user.id;
      const [tasksRes, subtasksRes, meetingsRes, settingsRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('user_id', userId),
        supabase.from('subtasks').select('*').eq('user_id', userId),
        supabase.from('meetings').select('*').eq('user_id', userId),
        supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      ]);
      const exportBundle = {
        exported_at: new Date().toISOString(),
        account_email: session.user.email,
        tasks: tasksRes.data || [],
        subtasks: subtasksRes.data || [],
        meetings: meetingsRes.data || [],
        settings: settingsRes.data || null,
      };
      const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dokkit-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setExportError('Could not export data: ' + msg);
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    const res = await fetch(apiUrl('/api/account/delete-account'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      setDeleteError(data.error || 'Could not delete account.');
      setDeleting(false);
      return;
    }
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!session) {
    return (
      <div className="app-shell account-portal">
        <AppHeader title="Account" backHref="/" />
        <p className="account-muted">Sign in on the main page first.</p>
      </div>
    );
  }

  const providers: string[] =
    (session.user.app_metadata?.providers as string[] | undefined) ||
    (session.user.identities || []).map((i: { provider: string }) => i.provider);
  const hasPassword = providers.includes('email');
  const signInMethod = providers.includes('google') ? 'Google' : 'Email & password';
  const memberSince = session.user.created_at
    ? new Date(session.user.created_at).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const planLabel =
    accountTier === 'trusted_tester'
      ? 'Trusted tester'
      : accountTier === 'premium'
        ? 'Dokkit'
        : 'Free';

  return (
    <div className="app-shell account-portal">
      <AppHeader title="Account" backHref="/" />

      <div className="account-layout">
        <nav className="account-subnav" aria-label="Account sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={
                section === s.id ? 'account-subnav-item is-active' : 'account-subnav-item'
              }
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="account-main">
          {section === 'profile' && (
            <>
              <section className="account-card">
                <p className="account-card-kicker">Signed in</p>
                <h2 className="account-card-title mono">{session.user.email}</h2>
                <dl className="account-dl">
                  <div>
                    <dt>Sign-in method</dt>
                    <dd>{signInMethod}</dd>
                  </div>
                  {memberSince && (
                    <div>
                      <dt>Member since</dt>
                      <dd>{memberSince}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Plan</dt>
                    <dd>{planLabel}</dd>
                  </div>
                </dl>
              </section>

              <section className="account-card">
                <h2 className="account-card-heading">Install</h2>
                {isStandalone ? (
                  <p className="account-muted">You are using the installed app.</p>
                ) : (
                  <>
                    <p className="account-muted">
                      Add Dokkit to your home screen for a faster, full-screen experience.
                    </p>
                    <button type="button" className="btn btn-ghost" onClick={handleInstallClick}>
                      {deferredPrompt ? 'Install Dokkit' : isIOS ? 'How to install' : 'Install Dokkit'}
                    </button>
                    {showIOSInstructions && (
                      <p className="account-muted" style={{ marginTop: 12 }}>
                        Tap Share in Safari, then &quot;Add to Home Screen.&quot;
                      </p>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          {section === 'plan' && (
            <section className="account-card">
              <p className="account-card-kicker">Plan &amp; billing</p>
              {billingLoading && <p className="account-muted">Loading…</p>}
              {!billingLoading && billingSummary && (
                <>
                  <h2 className="account-card-title">{billingSummary.planName}</h2>
                  <p className="account-muted">{billingSummary.planSummary}</p>
                  <dl className="account-dl">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        {billingSummary.subscriptionStatus ||
                          billingSummary.billingStatus ||
                          '—'}
                      </dd>
                    </div>
                    {billingSummary.priceDisplay && (
                      <div>
                        <dt>Price</dt>
                        <dd>
                          {billingSummary.priceDisplay}
                          {billingSummary.interval
                            ? ` / ${billingSummary.interval}`
                            : ''}
                        </dd>
                      </div>
                    )}
                    {billingSummary.currentPeriodEnd && billingSummary.isPro && (
                      <div>
                        <dt>
                          {billingSummary.cancelAtPeriodEnd
                            ? 'Access until'
                            : 'Next renewal'}
                        </dt>
                        <dd>
                          {new Date(
                            billingSummary.currentPeriodEnd
                          ).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              )}
              {!billingLoading && !billingSummary && (
                <p className="account-muted">Plan: {planLabel}</p>
              )}
              <div className="account-actions">
                <Link href="/account/billing" className="btn btn-steel">
                  Open billing
                </Link>
              </div>
              <p className="account-footnote">
                Invoices, payment method, and subscription changes are managed on the
                billing page (Stripe).
              </p>
            </section>
          )}

          {section === 'security' && (
            <section className="account-card">
              <h2 className="account-card-heading">Security</h2>
              <p className="account-muted">
                Protect access to your Dokkit account. Sessions are tied to this browser
                or device.
              </p>
              <div className="account-actions">
                <Link
                  href="/account/change-password"
                  className="btn btn-ghost"
                  style={{ textAlign: 'center', textDecoration: 'none' }}
                >
                  {hasPassword ? 'Change password' : 'Set a password'}
                </Link>
                <button type="button" className="btn btn-ghost" onClick={() => void handleLogOut()}>
                  Sign out
                </button>
              </div>
            </section>
          )}

          {section === 'storage' && (
            <section className="account-card">
              <h2 className="account-card-heading">Storage</h2>
              {storageQuota ? (
                <>
                  <p className="account-body">
                    {formatStorageBytes(storageQuota.usedBytes)} of{' '}
                    {formatStorageBytes(storageQuota.limitBytes)} used (
                    {formatStoragePercent(storageQuota.ratio)})
                  </p>
                  <div
                    className="account-meter"
                    role="progressbar"
                    aria-valuenow={Math.round(storageQuota.ratio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="account-meter-fill"
                      style={{
                        width: `${Math.min(100, storageQuota.ratio * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="account-muted" style={{ marginTop: 12 }}>
                    Includes files and observations stored in Dokkit. Export or remove
                    media to free space.
                  </p>
                </>
              ) : (
                <p className="account-muted">Storage details unavailable.</p>
              )}
            </section>
          )}

          {section === 'data' && (
            <>
              <section className="account-card">
                <h2 className="account-card-heading">Export</h2>
                <p className="account-muted">
                  Download a JSON copy of your tasks, meetings, and settings. Media files
                  are not included in this export.
                </p>
                <div className="account-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void exportData()}
                    disabled={exporting}
                  >
                    {exporting ? 'Exporting…' : 'Export my data'}
                  </button>
                </div>
                {exportError && (
                  <p className="account-alert" role="alert">
                    {exportError}
                  </p>
                )}
              </section>

              <section className="account-card account-card-danger">
                <h2 className="account-card-heading">Delete account</h2>
                <p className="account-muted">
                  Permanently deletes your account and associated data. This cannot be
                  undone.
                </p>
                {!deleteOpen ? (
                  <button
                    type="button"
                    className="btn btn-ghost danger-btn"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete account…
                  </button>
                ) : (
                  <div className="account-delete-confirm">
                    <label className="settings-label" htmlFor="delete-confirm">
                      Type DELETE to confirm
                    </label>
                    <input
                      id="delete-confirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      autoComplete="off"
                      className="account-input"
                    />
                    <div className="account-actions">
                      <button
                        type="button"
                        className="btn danger-btn-solid"
                        disabled={deleting}
                        onClick={() => void handleDeleteAccount()}
                      >
                        {deleting ? 'Deleting…' : 'Delete permanently'}
                      </button>
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteConfirmText('');
                          setDeleteError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {deleteError && (
                      <p className="account-alert" role="alert">
                        {deleteError}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
