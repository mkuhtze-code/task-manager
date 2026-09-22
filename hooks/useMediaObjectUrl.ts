'use client';

import { useEffect, useState } from 'react';
import { isMediaRef } from '@/lib/mediaStore';
import { resolveMediaBlob } from '@/lib/mediaCloud';

/**
 * Turn stored media into a renderable object URL.
 * Tries device cache (idb://) first, then cloud storage_path so mobile and
 * desktop share the same evidence.
 */
export function useMediaObjectUrl(
  ref: string | null | undefined,
  storagePath?: string | null
): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({
    url: null,
    missing: false,
  });

  useEffect(() => {
    if (!ref && !storagePath) {
      setState({ url: null, missing: true });
      return;
    }
    if (ref && ref.startsWith('blob:')) {
      setState({ url: ref, missing: false });
      return;
    }
    if (ref && !isMediaRef(ref) && !storagePath) {
      setState({ url: null, missing: true });
      return;
    }

    let live = true;
    let objectUrl: string | null = null;

    resolveMediaBlob(ref, storagePath)
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
  }, [ref, storagePath]);

  return state;
}
