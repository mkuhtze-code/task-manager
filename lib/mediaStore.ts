// ── Device-local media persistence ────────────────────────────────────
// Captured photos and voice are browser blobs, and a `blob:` URL dies with
// its session. To make the meeting evidence survive a restart, the bytes
// are parked in IndexedDB and `meeting_media.local_uri` stores a stable
// `idb://…` reference instead of a temporary URL. Rendering resolves the
// reference back to a fresh object URL on demand. Nothing here uploads,
// streams or touches Supabase Storage — this is the same device-local
// principle as V1/V2.1, only reliable across reloads.
//
//   database: dokkit-media-store
//   object store: blobs
//   record: { id, blob, mimeType, createdAt, sizeBytes }
//
// New captures are written here at capture time (before any Supabase row
// exists), so a reload can never lose bytes that are in hand. A data row
// is only created once its `local_uri` points at a successfully stored
// record. A `blob:` reference is never accepted as a durable value.

const DB_NAME = 'dokkit-media-store';
const DB_VERSION = 2;
const STORE = 'blobs';
export const REF_PREFIX = 'idb://';

let dbPromise: Promise<IDBDatabase> | null = null;

export type MediaRecord = {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
  sizeBytes: number;
};

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

export function isMediaRef(ref: string): boolean {
  return ref.startsWith(REF_PREFIX);
}

export function decodeRef(ref: string): string {
  return ref.slice(REF_PREFIX.length);
}

// Store one captured piece of media under a fresh stable id and return the
// durable `idb://…` reference for it. Only fails if IndexedDB itself fails.
export async function saveMediaBlob(
  blob: Blob,
  meta?: { mime?: string | null; size?: number | null }
): Promise<string> {
  const db = await openDb();
  const id = makeId();
  const record: MediaRecord = {
    id,
    blob,
    mimeType: meta?.mime && meta.mime.length > 0 ? meta.mime : blob.type || '',
    createdAt: new Date().toISOString(),
    sizeBytes: meta?.size ?? blob.size,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  return `${REF_PREFIX}${id}`;
}

// Resolve a reference (or nothing) back to its bytes. Unknown references
// resolve to null — the caller decides whether that is "unavailable".
// Tolerates legacy v1 records that stored the raw Blob as the value.
export async function loadMediaBlob(ref: string): Promise<Blob | null> {
  if (!isMediaRef(ref)) return null;
  const db = await openDb().catch(() => null);
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(decodeRef(ref));
    request.onsuccess = () => {
      const raw = request.result as Blob | MediaRecord | undefined;
      resolve(raw instanceof Blob ? raw : raw?.blob instanceof Blob ? raw.blob : null);
    };
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
