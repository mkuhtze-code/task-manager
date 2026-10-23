'use client';

import SurfaceNav, { type NavSurface } from '@/components/SurfaceNav';
import type { InstrumentLens } from '@/components/instrument/AppShell';

/**
 * The system dock intentionally delegates route and entitlement behavior to
 * the existing, regression-tested SurfaceNav during the strangler transition.
 */
export default function SystemDock({
  lens,
  onAdd,
  addLabel,
}: {
  lens: InstrumentLens;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="instrument-system-dock" data-instrument-system-dock data-active-lens={lens}>
      <SurfaceNav active={lens as NavSurface} onAdd={onAdd} addLabel={addLabel} />
    </div>
  );
}
