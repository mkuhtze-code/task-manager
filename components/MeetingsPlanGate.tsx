'use client';

import Link from 'next/link';

/**
 * Calm plan gate for Meetings — explains the surface and offers upgrade
 * without trapping the user or nagging from Today.
 */
export default function MeetingsPlanGate() {
  return (
    <div className="meetings-plan-gate" role="region" aria-label="Meetings requires Dokkit">
      <p className="meetings-plan-gate-kicker">Dokkit plan</p>
      <h2 className="meetings-plan-gate-title">Meetings is part of Dokkit</h2>
      <p className="meetings-plan-gate-body">
        Record time with people around a job, keep observations with the work, and
        pick it up later on any device. Today, Jobs, and Travel stay available on Free.
      </p>
      <div className="meetings-plan-gate-actions">
        <Link href="/account/billing" className="btn btn-steel">
          View plan
        </Link>
        <Link href="/" className="btn-text">
          Back to Today
        </Link>
      </div>
    </div>
  );
}

