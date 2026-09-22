'use client';

import { useState } from 'react';
import { useMediaObjectUrl } from '@/hooks/useMediaObjectUrl';

// Graceful, quiet fallback when a media reference cannot render — either
// IndexedDB lost the bytes (idb:// ref to nothing) or a legacy V1/V2.1
// blob: URL belongs to a finished session. Cloud storage_path fills the
// gap across devices. Same visual language: no raw broken-image icon.
export function MediaUnavailable({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span className={className ? `${className} media-unavailable` : 'media-unavailable'}>
      {label}
    </span>
  );
}

function useResolvedMedia(ref: string, storagePath?: string | null) {
  const { url, missing } = useMediaObjectUrl(ref, storagePath);
  const [broken, setBroken] = useState(false);
  return { url, unavailable: missing || broken, onError: () => setBroken(true) };
}

export function PhotoImage({
  uri: mediaRef,
  storagePath = null,
  alt,
  className,
  eager = false,
}: {
  uri: string;
  /** Supabase Storage path — used when this device has no idb cache. */
  storagePath?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const { url, unavailable, onError } = useResolvedMedia(mediaRef, storagePath);
  if (unavailable || !url) {
    return <MediaUnavailable label="Photo unavailable" className={className} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      onError={onError}
    />
  );
}

export function AudioNote({
  uri: mediaRef,
  storagePath = null,
  className,
}: {
  uri: string;
  storagePath?: string | null;
  className?: string;
}) {
  const { url, unavailable, onError } = useResolvedMedia(mediaRef, storagePath);
  if (unavailable || !url) {
    return <MediaUnavailable label="Audio unavailable" className={className} />;
  }
  return <audio controls src={url} className={className} onError={onError} />;
}
