export type LensStateSnapshot<T> = { version: 1; state: T; scrollY: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function sessionStore(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}
function normalizeScrollY(scrollY: number): number {
  return Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
}
/** Serialize a small, non-sensitive view-state snapshot. */
export function serializeLensState<T>(state: T, scrollY = 0): string {
  return JSON.stringify({ version: 1, state, scrollY: normalizeScrollY(scrollY) } satisfies LensStateSnapshot<T>);
}
/** Parse a compatible snapshot; malformed, stale-version, and invalid scroll values are ignored. */
export function deserializeLensState<T>(raw: string | null): LensStateSnapshot<T> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LensStateSnapshot<T>>;
    if (value.version !== 1 || value.state == null || typeof value.scrollY !== 'number' ||
        !Number.isFinite(value.scrollY) || value.scrollY < 0) return null;
    return value as LensStateSnapshot<T>;
  } catch { return null; }
}
/** Save to session-only storage. Storage restrictions must never block navigation. */
export function saveLensState<T>(key: string, state: T, scrollY = 0): void {
  try { sessionStore()?.setItem(key, serializeLensState(state, scrollY)); } catch { /* Best-effort only. */ }
}
/** Load a session snapshot. Missing or inaccessible storage is a cache miss. */
export function loadLensState<T>(key: string): LensStateSnapshot<T> | null {
  try { return deserializeLensState<T>(sessionStore()?.getItem(key) ?? null); } catch { return null; }
}
/** Clear one lens/trip snapshot without touching any other key. */
export function clearLensState(key: string): void {
  try { sessionStore()?.removeItem(key); } catch { /* Best-effort only. */ }
}
