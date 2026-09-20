'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';

/**
 * Client chrome shared across the app.
 * - Always mounts the active-task banner.
 * - Applies data-surface on <html> via useSurfaceMode.
 * - On desktop mode: left sidebar + fluid main (pages still use .app-shell;
 *   CSS expands it under [data-surface="desktop"]).
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useSurfaceMode();

  if (isDesktop) {
    return (
      <div className="desk-shell">
        <DesktopSidebar />
        <div className="desk-main">
          <ActiveTimerBar />
          {children}
        </div>
      </div>
    );
  }

  return (
    <>
      <ActiveTimerBar />
      {children}
    </>
  );
}
