'use client';

import ActiveTimerBar from '@/components/ActiveTimerBar';

/** Client chrome shared across the app (active-task banner, etc.). */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActiveTimerBar />
      {children}
    </>
  );
}
