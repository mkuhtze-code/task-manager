'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingMedia } from '@/lib/meetingTypes';
import { photoAlt } from '@/lib/meetingCapture';
import { PhotoImage } from '@/components/MediaRender';
import { CloseIcon } from '@/components/icons';

export default function MeetingPhotoCarousel(props: {
  photos: MeetingMedia[];
  labelBase?: string;
}) {
  const { photos, labelBase = 'Observation photos' } = props;
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

  useEffect(() => {
    if (open !== null) scrollTo(open);
  }, [open, scrollTo]);

  useEffect(() => {
    if (open === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    frameRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
      else if (e.key === 'ArrowLeft')
        setOpen((v) => (v === null ? v : (v - 1 + photos.length) % photos.length));
      else if (e.key === 'ArrowRight')
        setOpen((v) => (v === null ? v : (v + 1) % photos.length));
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
              aria-label={photoAlt(p, i, photos.length)}
            >
              <PhotoImage
                uri={p.local_uri}
                storagePath={p.storage_path}
                alt=""
                eager={i === safeIndex}
              />
            </button>
          </div>
        ))}
      </div>

      {hasNav && (
        <div className="meeting-carousel-nav">
          <button
            type="button"
            className="meeting-carousel-btn"
            onClick={() => goTo(safeIndex - 1)}
            aria-label="Previous photo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5.5 8.5 12l6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="meeting-carousel-count" aria-live="polite">
            {safeIndex + 1} / {photos.length}
          </span>
          <div className="meeting-carousel-dots" aria-hidden="true">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={i === safeIndex ? 'meeting-carousel-dot is-active' : 'meeting-carousel-dot'}
                onClick={() => goTo(i)}
                aria-label={photoAlt(p, i, photos.length)}
                tabIndex={-1}
              />
            ))}
          </div>
          <button
            type="button"
            className="meeting-carousel-btn"
            onClick={() => goTo(safeIndex + 1)}
            aria-label="Next photo"
          >
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
          aria-label={`Photo ${open + 1} of ${photos.length}`}
          ref={frameRef}
          tabIndex={-1}
          onClick={() => setOpen(null)}
        >
          <button type="button" className="meeting-lightbox-close" aria-label="Close photo" onClick={() => setOpen(null)}>
            <CloseIcon />
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
            <PhotoImage
              uri={photos[open].local_uri}
              storagePath={photos[open].storage_path}
              alt={photoAlt(photos[open], open, photos.length)}
              eager
            />
            <figcaption>
              {open + 1} / {photos.length}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
