'use client';

import { useState } from 'react';
import { useMediaObjectUrl } from '@/hooks/useMediaObjectUrl';

// Graceful, quiet fallback when a media reference cannot render — either
// IndexedDB lost the bytes (idb:// ref to nothing) or a legacy V1/V2.1
// blob: URL belongs to a finished session. Very old references are always
// handled this way; the record is kept, the bytes are gone. Same visual
// language as the rest of Dokkit: no raw broken-image icon, just a whisper.
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

function useResolvedMedia(ref: string) {
  const { url, missing } = useMediaObjectUrl(ref);
  const [broken, setBroken] = useState(false);
  return { url, unavailable: missing || broken, onError: () => setBroken(true) };
}

// A photo that knows how to come back from IndexedDB and how to fail
// quietly. Exported for the evidence carousel and the edit state.
export function PhotoImage({
  ref: mediaRef,
  alt,
  className,
  eager = false,
}: {
  ref: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const { url, unavailable, onError } = useResolvedMedia(mediaRef);
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

// The same resolver for voice notes. A live audio row renders the native
// <audio controls> element; an unresolvable one keeps its slot as a quiet
// note instead of a dead control.
export function AudioNote({
  ref: mediaRef,
  className,
}: {
  ref: string;
  className?: string;
}) {
  const { url, unavailable, onError } = useResolvedMedia(mediaRef);
  if (unavailable || !url) {
    return <MediaUnavailable label="Audio unavailable" className={className} />;
  }
  return <audio controls src={url} className={className} onError={onError} />;
}