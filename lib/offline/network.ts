/** Online / offline detection with subscribe. */

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function subscribeOnline(handler: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const on = () => handler(true);
  const off = () => handler(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}
