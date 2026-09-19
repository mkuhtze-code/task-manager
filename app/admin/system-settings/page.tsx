'use client';

export default function AdminSystemSettingsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>System settings</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}>
          Global configuration is environment-based (Vercel / Supabase). Secrets are never read back into the Admin UI.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
          Per-user preferences live in each account&apos;s settings and are not browsable from Admin.
        </p>
      </div>
    </div>
  );
}
