'use client';

import type { ReactNode } from 'react';
import SystemDock from '@/components/instrument/SystemDock';

export type InstrumentLens = 'today' | 'jobs' | 'meetings' | 'travel';

type AppShellProps = {
  lens: InstrumentLens;
  children: ReactNode;
  header?: ReactNode;
  dock?: ReactNode;
};

/**
 * Instrument's structural owner. Pages remain responsible for their body and
 * existing business logic; this component owns only the shared shell regions.
 */
export default function AppShell({ lens, children, header, dock }: AppShellProps) {
  return (
    <div className="instrument-shell" data-instrument-shell data-lens={lens}>
      {header ? <div className="instrument-shell__header">{header}</div> : null}
      <div className="instrument-shell__body">{children}</div>
      {dock === undefined ? <SystemDock lens={lens} /> : dock}
    </div>
  );
}
