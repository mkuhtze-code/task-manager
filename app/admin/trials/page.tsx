'use client';

export default function AdminTrialsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>No trial tracking</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          Trials are not recorded yet. This page will stay empty rather than invent metrics.
        </p>
      </div>
    </div>
  );
}
