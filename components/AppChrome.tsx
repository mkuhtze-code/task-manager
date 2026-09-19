'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';

/** Client chrome shared across the app (persistent timer player, etc.). */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ActiveTimerBar />
    </>
  );
}
