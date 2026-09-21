'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopContextStrip from '@/components/DesktopContextStrip';
import DesktopPrimaryBar from '@/components/DesktopPrimaryBar';
import DesktopProductNav from '@/components/DesktopProductNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';

/**
 * Desktop chrome (header-heart model):
 *   settings sidebar | main
 *     ├ product tabs (Today · Jobs · Meetings · Travel)
 *     ├ context strip (per-surface; placeholders OK)
 *     ├ floating primary action
 *     └ page body
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
