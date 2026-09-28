'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';
import DesktopContextStrip from '@/components/DesktopContextStrip';
import DesktopProductNav from '@/components/DesktopProductNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';

/**
 * Dokkit application chrome.
 *
 * Desktop is not a second product.
 * It is the same Dokkit surface presented with more room.
 */
export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDesktop } = useSurfaceMode();

  if (isDesktop) {
    return (
      <div className="desk-shell">
        <DesktopSidebar />

        <div className="desk-main">
          <ActiveTimerBar />

          <DesktopProductNav />

          <DesktopContextStrip />

          <div
            className="desk-main-body"
            id="main-content"
            role="main"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ActiveTimerBar />

      <div
        id="main-content"
        role="main"
      >
        {children}
      </div>
    </>
  );
}
