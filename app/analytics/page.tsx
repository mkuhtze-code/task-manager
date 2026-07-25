
'use client';

import AppHeader from '@/components/AppHeader';

export default function Analytics() {
  return (
    <div className="app-shell">
      <AppHeader title="Analytics" backHref="/" />
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Coming soon</div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
          This is where a look back at your time will live.
        </p>
      </div>
    </div>
  );
}
