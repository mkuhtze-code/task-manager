'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ActiveTimerBar from '@/components/ActiveTimerBar';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { TodayHeader } from '@/components/TodayHeader';
import { useTodayAuth } from '@/hooks/useTodayAuth';
import { useTodayHeaderState } from '@/components/today/TodayHeaderState';
import DesktopContextStrip from '@/components/DesktopContextStrip';
import DesktopProductNav from '@/components/DesktopProductNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import SurfaceNav from '@/components/SurfaceNav';
import { getDesktopPrimaryAction, requestCaptureOpen, subscribeDesktopPrimaryAction } from '@/lib/captureOpen';

const SURFACE_PATHS = ['/', '/jobs', '/meetings', '/travel'] as const;
type SwipePoint = { x: number; y: number; ignored: boolean };

/**
 * Dokkit application chrome.
 *
 * Desktop is not a second product.
 * It is the same Dokkit surface presented with more room.
 *
 * Mobile surface swipes are deliberately attached to the content region only:
 * the existing context and timer chrome are not part of the gesture area.
 */
export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDesktop } = useSurfaceMode();
  const { session } = useTodayAuth();
  const { headerProps } = useTodayHeaderState();
  const pathname = usePathname();
  const router = useRouter();
  const touchStart = useRef<SwipePoint | null>(null);
  const pendingDirection = useRef<'next' | 'previous' | null>(null);
  const [enterDirection, setEnterDirection] = useState<'next' | 'previous' | null>(null);
  const [primaryAction, setPrimaryAction] = useState(() => getDesktopPrimaryAction());

  useEffect(() => {
    const refresh = () => setPrimaryAction(getDesktopPrimaryAction());
    refresh();
    return subscribeDesktopPrimaryAction(refresh);
  }, []);

  useEffect(() => {
    const direction = pendingDirection.current;
    pendingDirection.current = null;
    if (!direction) return;
    setEnterDirection(direction);
    const timeout = window.setTimeout(() => setEnterDirection(null), 240);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  function currentSurfaceIndex(path: string | null) {
    if (!path) return -1;
    if (path === '/') return 0;
    if (path === '/jobs' || path.startsWith('/jobs/')) return 1;
    if (path === '/meetings' || path.startsWith('/meetings/')) return 2;
    if (path === '/travel' || path.startsWith('/travel/')) return 3;
    return -1;
  }

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const target = event.target;
    const ignored =
      target instanceof Element &&
      Boolean(
        target.closest(
          'input, textarea, select, [contenteditable="true"], [data-no-surface-swipe], .sheet-overlay, .surface-nav, .surface-tabs, [data-horizontal-scroll]'
        )
      );
    const touch = event.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      ignored: ignored || currentSurfaceIndex(pathname) < 0,
    };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.ignored || isDesktop) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Require a clear horizontal intent so vertical scrolling remains natural.
    if (Math.abs(dx) < 76 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    const current = currentSurfaceIndex(pathname);
    const next = current + (dx < 0 ? 1 : -1);
    if (current < 0 || next < 0 || next >= SURFACE_PATHS.length) return;

    pendingDirection.current = dx < 0 ? 'next' : 'previous';
    router.push(SURFACE_PATHS[next]);
  }

  if (isDesktop) {
    return (
      <div className="desk-shell">
        <DesktopSidebar />

        <div className="desk-main">
          <ActiveTimerBar />

          <DesktopProductNav />

          <DesktopContextStrip />

          {session?.user?.id && (
            <>
              <TravelAwarenessBanner userId={session.user.id} />
              <OfflineStatusBar userId={session.user.id} />
            </>
          )}

          {session?.user?.id && headerProps && (
            <div className="persistent-today-header-shell">
              <TodayHeader
                {...headerProps}
                onRecalcRoute={pathname === '/' ? headerProps.onRecalcRoute : () => router.push('/')}
                onViewMap={pathname === '/' ? headerProps.onViewMap : () => router.push('/')}
                onRealityCheck={pathname === '/' ? headerProps.onRealityCheck : () => router.push('/')}
                onDockIt={pathname === '/' ? headerProps.onDockIt : () => router.push('/')}
              />
            </div>
          )}

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
    <div className="experience-mobile-frame">
      <div className="experience-mobile-frame__signals" aria-label="Current status">
        <ActiveTimerBar />
        {session?.user?.id ? (
          <>
            <TravelAwarenessBanner userId={session.user.id} />
            <OfflineStatusBar userId={session.user.id} />
          </>
        ) : null}
      </div>

      {session?.user?.id && headerProps && pathname === '/' ? (
        <div className="experience-mobile-frame__day">
          <TodayHeader
            {...headerProps}
            onRecalcRoute={pathname === '/' ? headerProps.onRecalcRoute : () => router.push('/')}
            onViewMap={pathname === '/' ? headerProps.onViewMap : () => router.push('/')}
            onRealityCheck={pathname === '/' ? headerProps.onRealityCheck : () => router.push('/')}
            onDockIt={pathname === '/' ? headerProps.onDockIt : () => router.push('/')}
          />
        </div>
      ) : null}

      <main
        id="main-content"
        className={`experience-mobile-frame__workspace${enterDirection ? ` surface-page-enter-${enterDirection}` : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {children}
      </main>

      {session?.user?.id && currentSurfaceIndex(pathname) >= 0 ? (
        <SurfaceNav
          active={currentSurfaceIndex(pathname) === 0 ? 'today' : currentSurfaceIndex(pathname) === 1 ? 'jobs' : currentSurfaceIndex(pathname) === 2 ? 'meetings' : 'travel'}
          onAdd={primaryAction ? requestCaptureOpen : undefined}
          addLabel={primaryAction?.label ?? 'Add'}
        />
      ) : null}
    </div>
  );
}
