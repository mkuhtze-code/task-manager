'use client';

import type { PendingRealityInvite } from '@/lib/realityCapture';

type TodayStatusCardsProps = {
  hasStarterTasks: boolean;
  clearingStarter: boolean;
  onClearStarter: () => void | Promise<void>;
  setupLine: string | null;
  onDismissSetupLine: () => void;
  pendingRealityInvite: PendingRealityInvite | null;
  onReviewRealityInvite: () => void;
  onDismissRealityInvite: () => void;
};

export function TodayStatusCards({
  hasStarterTasks,
  clearingStarter,
  onClearStarter,
  setupLine,
  onDismissSetupLine,
  pendingRealityInvite,
  onReviewRealityInvite,
  onDismissRealityInvite,
}: TodayStatusCardsProps) {
  return (
    <>
      {hasStarterTasks && (
        <div className="reality-invite-card starter-pack-banner" role="region" aria-label="Example tasks">
          <p className="reality-invite-kicker">Examples</p>
          <p className="reality-invite-body">
            A few sample items so Today isn&apos;t empty. They never train Dokkit&apos;s learning.
          </p>
          <div className="reality-invite-actions">
            <button
              type="button"
              className="btn-text"
              disabled={clearingStarter}
              onClick={onClearStarter}
            >
              {clearingStarter ? 'Removing…' : 'Clear examples'}
            </button>
          </div>
        </div>
      )}

      {setupLine && (
        <div className="reality-invite-card" role="status">
          <p className="reality-invite-body" style={{ marginBottom: 8 }}>
            {setupLine}
          </p>
          <button type="button" className="btn-text" onClick={onDismissSetupLine}>
            Got it
          </button>
        </div>
      )}

      {pendingRealityInvite && (
        <div className="reality-invite-card" role="region" aria-label="Reality check">
          <p className="reality-invite-kicker">Yesterday</p>
          <p className="reality-invite-body">
            {pendingRealityInvite.taskCount === 1
              ? 'One thing may still be open from yesterday.'
              : `${pendingRealityInvite.taskCount} things may still be open from yesterday.`}
          </p>
          <div className="reality-invite-actions">
            <button type="button" className="btn btn-steel" onClick={onReviewRealityInvite}>
              Review
            </button>
            <button type="button" className="btn-text" onClick={onDismissRealityInvite}>
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
