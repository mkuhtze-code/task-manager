import type { CapturedMedia } from '@/lib/meetingCapture';

// ── Device-local media persistence ────────────────────────────────────
// Captured photos and voice are browser blobs, and a `blob:` URL dies with
// its session. To make the meeting evidence survive a restart, the bytes
// are parked in IndexedDB and `meeting_media.local_uri` stores a stable
// `idb://…` reference instead of a temporary URL. Rendering resolves the
// reference back to a fresh object URL on demand. Nothing here uploads,
// streams or touches Supabase Storage — this is the same device-local
// principle as V1/V2.1, only reliable across reloads.

const DB_NAME = 'dokkit-media-store';
const DB_VERSION = 1;
const STORE = 'blobs';
const REF_PREFIX = 'idb://';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Park one captured piece of media and return its stable reference. The
// bytes live only on this device, keyed by the reference we hand the DB.
export async function saveMediaBlob(blob: Blob): Promise<string> {
  const db = await openDb();
  const id = makeId();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return `${REF_PREFIX}${id}`;
}

// Resolve a reference (or nothing) back to its bytes. Unknown references
// resolve to null — the caller decides whether that is "unavailable".
export async function loadMediaBlob(ref: string): Promise<Blob | null> {
  if (!isMediaRef(ref)) return null;
  const db = await openDb().catch(() => null);
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(decodeRef(ref));
    request.onsuccess = () => resolve((request.result as Blob) ?? null);
    request.onerror = () => resolve(null);
  });
}

// Release the bytes behind a reference when the row that referenced them is
// deleted. Silent no-op for legacy/blob refs — nothing was ever stored.
export async function deleteMediaBlob(ref: string | null): Promise<void> {
  if (!ref || !isMediaRef(ref)) return;
  const db = await openDb().catch(() => null);
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(decodeRef(ref));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function isMediaRef(ref: string): boolean {
  return ref.startsWith(REF_PREFIX);
}

function decodeRef(ref: string): string {
  return ref.slice(REF_PREFIX.length);
}

// Hand a fresh capture to the media layer: whatever bytes are in hand
// become the stable reference that the DB row will store.
export async function persistCapturedMedia(m: CapturedMedia): Promise<string> {
  const blob =
    m.blob ??
    (m.uri.startsWith('blob:')
      ? await fetch(m.uri).then((r) => r.blob())
      : null);
  if (!blob) throw new Error('Media bytes unavailable to persist');
  return saveMediaBlob(blob);
}