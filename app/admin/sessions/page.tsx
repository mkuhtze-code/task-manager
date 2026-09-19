'use client';

/**
 * Session listing would require Auth Admin APIs that expose device/IP-level
 * data. Until there is a clear retention and purpose policy, this page stays
 * intentionally empty of live session rows.
 */
export default function AdminSessionsPage() {
  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div className="settings-panel" style={{ margin: 0 }}>
        <strong style={{ fontSize: 13 }}>Sessions not listed</strong>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}>
          Active session inventories (devices, IPs, last seen) are not exposed in Admin yet. Pulling that from Auth would create a high-sensitivity dataset without a defined retention policy.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
          What exists today:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
          <li>Terminating an account signs the user out globally (Users page).</li>
          <li>Privileged routes reject terminated accounts via verifyUser.</li>
          <li>Admin membership is listed under Admin Access (read-only).</li>
        </ul>
      </div>
    </div>
  );
}
