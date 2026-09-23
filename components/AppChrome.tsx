'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopBannerHost from '@/components/DesktopBannerHost';
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
          <DesktopBannerHost />
          <div className="desk-main-body" id="main-content" role="main">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ActiveTimerBar />
      <div id="main-content" role="main">
        {children}
      </div>
    </>
  );
}
