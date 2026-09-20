'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopBannerHost from '@/components/DesktopBannerHost';
import DesktopPrimaryBar from '@/components/DesktopPrimaryBar';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';

/**
 * Desktop chrome:
 *   primary sidebar | main column
 *     ├ optional day/status banner (page-registered)
 *     ├ floating primary action (Dock it / Add …)
 *     └ page body (prefer DesktopWorkspace = secondary list + detail pane)
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useSurfaceMode();

  if (isDesktop) {
    return (
      <div className="desk-shell">
        <DesktopSidebar />
        <div className="desk-main">
          <ActiveTimerBar />
          <DesktopBannerHost />
          <DesktopPrimaryBar />
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
