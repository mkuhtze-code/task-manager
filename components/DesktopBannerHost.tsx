'use client';

import { useSyncExternalStore } from 'react';
import {
  getDesktopBanner,
  subscribeDesktopBanner,
} from '@/lib/desktopBanner';

/** Renders the page-registered desktop banner (e.g. day capacity strip). */
export default function DesktopBannerHost() {
  const content = useSyncExternalStore(
    subscribeDesktopBanner,
    getDesktopBanner,
    () => null
  );

  if (!content) return null;

  return <div className="desk-banner">{content}</div>;
}
