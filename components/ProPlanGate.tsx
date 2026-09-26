'use client';

import Link from 'next/link';
import { PRO_FEATURE_COPY, type ProFeature } from '@/lib/billing';

/**
 * Calm Pro gate — explains the surface, price path via billing, no traps.
 */
export default function ProPlanGate({
  feature,
  backHref = '/',
  backLabel = 'Back to Today',
}: {
  feature: ProFeature;
  backHref?: string;
  backLabel?: string;
}) {
  const copy = PRO_FEATURE_COPY[feature];
  return (
    <div
      className="meetings-plan-gate pro-plan-gate"
      role="region"
      aria-label={`${copy.title} requires Dokkit`}
    >
      <p className="meetings-plan-gate-kicker">Dokkit plan</p>
      <h2 className="meetings-plan-gate-title">{copy.title}</h2>
      <p className="meetings-plan-gate-body">{copy.body}</p>
      <p className="meetings-plan-gate-body" style={{ marginTop: -8 }}>
        Available with Dokkit. Pricing is shown on the billing page.
      </p>
      <div className="meetings-plan-gate-actions">
        <Link href="/account/billing" className="btn btn-steel">
          View plan
        </Link>
        <Link href={backHref} className="btn-text">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
