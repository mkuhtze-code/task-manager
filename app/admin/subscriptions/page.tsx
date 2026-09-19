'use client';

export default function AdminSubscriptionsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>No subscription data</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          Subscription lifecycle is not implemented. Account tiers in Users are product flags (trusted tester / free / premium), not Stripe subscriptions.
        </p>
      </div>
    </div>
  );
}
