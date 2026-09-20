/** Optional sticky banner content registered by the active page (e.g. Today capacity). */

import type { ReactNode } from 'react';

let banner: ReactNode = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function setDesktopBanner(node: ReactNode): () => void {
  banner = node;
  notify();
  return () => {
    if (banner === node) {
      banner = null;
      notify();
    }
  };
}

export function getDesktopBanner(): ReactNode {
  return banner;
}

export function subscribeDesktopBanner(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
