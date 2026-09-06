'use client';

import { useEffect, useState } from 'react';
import { isMediaRef, loadMediaBlob } from '@/lib/mediaStore';

// Turn a stored `local_uri` into something renderable for as long as this
// element needs it:
//   * idb://…  → resolve the bytes from IndexedDB, hand back a fresh
//                object URL, and revoke it when this element unmounts.
//   * blob:…   → legacy V1/V2.1 rows; the URL only lives as long as its
//                session, so use it directly while it still might exist.
//   * anything else → resolvable to nothing, reported as `missing`.
// The caller decides the graceful fallback (quiet placeholder, keep the
// row). Nothing here deletes or rewrites a legacy reference.
export function useMediaObjectUrl(
  ref: string | null | undefined
): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({
    url: null,
    missing: false,
  });

  useEffect(() => {
    if (!ref) {
      setState({ url: null, missing: true });
      return;
    }
    if (ref.startsWith('blob:')) {
      setState({ url: ref, missing: false });
      return;
    }
    if (!isMediaRef(ref)) {
      setState({ url: null, missing: true });
      return;
    }
    let live = true;
    let objectUrl: string | null = null;
    loadMediaBlob(ref)
      .then((blob) => {
        if (!blob) {
          if (live) setState({ url: null, missing: true });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        if (live) setState({ url: objectUrl, missing: false });
      })
      .catch(() => {
        if (live) setState({ url: null, missing: true });
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref]);

  return state;
}