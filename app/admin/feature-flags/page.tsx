'use client';

export default function AdminFeatureFlagsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>No feature flag service</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          Flags are not centralized yet. Shipping a toggle UI before a store and audit would create silent behaviour changes without a trail.
        </p>
      </div>
    </div>
  );
}
