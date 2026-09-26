'use client';

import ProPlanGate from '@/components/ProPlanGate';

/** @deprecated Prefer ProPlanGate feature="meetings" */
export default function MeetingsPlanGate() {
  return <ProPlanGate feature="meetings" />;
}
