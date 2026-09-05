'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingMedia } from '@/lib/meetingTypes';
import { photoAlt } from '@/lib/meetingCapture';
import { CloseIcon } from '@/components/icons';

// A small, restrained photo strip used twice: inside an observation (its
// own photos) and at meeting level (all of the meeting's photos). Native
// scroll-snapping gives touch swiping for free; prev/next and the photo
// count only appear when there is more than one photo. Tapping the image
// opens a lightweight full-view state. No library, no decoration — just
// the evidence, kept in one place.
export default function MeetingPhotoCarousel(props: {
  photos: MeetingMedia[];
  getObservationText?: (photo: MeetingMedia) => string | null;
  labelBase?: string;
}) {
  const { photos, getObservationText, labelBase = 'Meeting photo' } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const hasNav = photos.length > 1;
  const safeIndex = photos.length === 0 ? 0 : Math.min(index, photos.length - 1);

  const scrollTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el || photos.length === 0) return;
      el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    },
    [photos.length]
  );

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(photos.length - 1, i));
      setIndex(next);
      scrollTo(next);
    },
    [photos.length, scrollTo]
  );

  function onTrackScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  // Sync the strip underneath whenever the lightbox moves.
  useEffect(() => {
    if (open !== null) scrollTo(open);
  }, [open, scrollTo]);

  // Keyboard control + body scroll lock while the lightbox is open.
  useEffect(() => {
    if (open === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    frameRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowLeft') setOpen((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
      else if (e.key === 'ArrowRight') setOpen((v) => (v === null ? v : (v + 1) % photos.length));
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, photos.length]);

  if (photos.length === 0) return null;

  return (
    <div className="meeting-carousel">
      <div
        className="meeting-carousel-track"
        ref={trackRef}
        onScroll={onTrackScroll}
        role="group"
        aria-label={labelBase}
        aria-roledescription="carousel"
      >
        {photos.map((p, i) => (
          <div className="meeting-carousel-slide" key={p.id}>
            <button
              type="button"
              className="meeting-carousel-open"
              onClick={() => setOpen(i)}
              aria-label={photoAlt(p, i, photos.length, getObservationText?.(p))}
            >
              <img src={p.local_uri} alt="" loading="lazy" />
            </button>
          </div>
        ))}
      </div>

      {hasNav && (
        <div className="meeting-carousel-nav">
          <button type="button" className="meeting-carousel-btn" onClick={() => goTo(safeIndex - 1)} aria-label="Previous photo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5.5 8.5 12l6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="meeting-carousel-count" aria-live="polite">
            {safeIndex + 1} / {photos.length}
          </span>
          <button type="button" className="meeting-carousel-btn" onClick={() => goTo(safeIndex + 1)} aria-label="Next photo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5.5 15.5 12 9 18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {open !== null && photos[open] && (
        <div
          className="meeting-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${labelBase} — photo ${open + 1} of ${photos.length}`}
          ref={frameRef}
          tabIndex={-1}
          onClick={() => setOpen(null)}
        >
          <button type="button" className="meeting-lightbox-close" aria-label="Close photo" onClick={() => setOpen(null)}>
            <CloseIcon size={20} />
          </button>

          {hasNav && (
            <>
              <button
                type="button"
                className="meeting-lightbox-btn meeting-lightbox-prev"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open - 1 + photos.length) % photos.length);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 5.5 8.5 12l6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="meeting-lightbox-btn meeting-lightbox-next"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + 1) % photos.length);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 5.5 15.5 12 9 18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}

          <figure onClick={(e) => e.stopPropagation()}>
            <img
              src={photos[open].local_uri}
              alt={photoAlt(photos[open], open, photos.length, getObservationText?.(photos[open]))}
            />
            <figcaption>
              {open + 1} / {photos.length}
              {(() => {
                const note = getObservationText?.(photos[open])?.trim();
                return note ? <span className="meeting-lightbox-caption">From observation: {note}</span> : null;
              })()}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}