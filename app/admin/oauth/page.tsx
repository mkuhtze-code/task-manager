'use client';

export default function AdminOAuthPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>OAuth grants</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}>
          Calendar OAuth tokens are encrypted at rest and never displayed in Admin. Connection counts appear under Integrations without emails.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
          A full grant browser is withheld until there is a clear revoke UX and audit path for each action.
        </p>
      </div>
    </div>
  );
}
