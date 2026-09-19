'use client';

export default function AdminAnnouncementsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>Announcements not available</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          There is no in-app broadcast channel yet. When added, messages will be product-scoped and logged in the audit trail.
        </p>
      </div>
    </div>
  );
}
