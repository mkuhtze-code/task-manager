'use client';

export default function AdminRevenuePage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>No revenue data</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          Dokkit is not collecting payment events. Revenue reporting will appear only after Stripe (or equivalent) is connected and audited.
        </p>
      </div>
    </div>
  );
}
