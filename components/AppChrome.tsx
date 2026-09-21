'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopContextStrip from '@/components/DesktopContextStrip';
import DesktopProductNav from '@/components/DesktopProductNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';

/**
 * Desktop chrome — powerful, quiet:
 *   settings rail | product heart + context | workspace
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useSurfaceMode();

  if (isDesktop) {
    return (
      <div className="desk-shell">
        <DesktopSidebar />
        <div className="desk-main">
          <ActiveTimerBar />
          <DesktopProductNav />
          <DesktopContextStrip />
          <div className="desk-main-body">{children}</div>
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
