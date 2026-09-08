'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import { clampIndex, type CapturedMedia } from '@/lib/meetingCapture';
import MeetingObservationTile from '@/components/MeetingObservationTile';
import { ChevronIcon } from '@/components/icons';

// Level-1 navigation: swiping (or the pills) moves across OBSERVATIONS,
// never inside a photo set. Each slide is a full observation tile; the tile
// holds its own level-2 photo carousel, so the two navigation levels stay
// distinct — the browser passes a horizontal drag to the inner strip when it
// can scroll, and to this strip when it cannot.
export default function MeetingObservationCarousel(props: {
  observations: MeetingObservation[];
  mediaByObservation: Map<string, MeetingMedia[]>;
  saving: boolean;
  index: number;
  onIndexChange: (i: number) => void;
  onDelete: (id: string) => void;
  onAddMedia: (observationId: string, captured: CapturedMedia) => Promise<boolean>;
  onSaveEdit: (
    observationId: string,
    text: string,
    removeMediaIds: string[],
    newMedia: CapturedMedia[]
  ) => Promise<boolean>;
}) {
  const { observations, mediaByObservation, saving, index, onIndexChange, onDelete, onAddMedia, onSaveEdit } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const count = observations.length;
  const safeIndex = clampIndex(index, count);

  const scrollTo = useCallback((i: number) => {
    const el = viewportRef.current;
    if (!el || el.clientWidth === 0) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollTo(safeIndex);
  }, [safeIndex, scrollTo]);

  // Keep the "N of M" label and the active tile in step with the swipe.
  function onViewportScroll() {
    const el = viewportRef.current;
    if (!el || el.clientWidth === 0) return;
    onIndexChange(clampIndex(Math.round(el.scrollLeft / el.clientWidth), count));
  }

  if (count === 0) return null;

  return (
    <div className="observation-carousel">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Evidence observations"
        className="observation-carousel-viewport"
        ref={viewportRef}
        onScroll={onViewportScroll}
      >
        {observations.map((o) => (
          <div className="observation-carousel-slide" key={o.id}>
            <MeetingObservationTile
              observation={o}
              media={mediaByObservation.get(o.id) ?? []}
              saving={saving}
              variant="detail"
              onDelete={() => onDelete(o.id)}
              onAddMedia={onAddMedia}
              onSaveEdit={onSaveEdit}
            />
          </div>
        ))}
      </div>
      <div className="observation-carousel-nav">
        <button
          type="button"
          className="meeting-pill meeting-pill--icon observation-carousel-btn observation-carousel-btn--prev"
          onClick={() => onIndexChange(safeIndex - 1)}
          disabled={safeIndex <= 0}
          aria-label="Previous observation"
        >
          <ChevronIcon size={16} />
        </button>
        <span className="observation-carousel-position" aria-live="polite">
          {Math.min(safeIndex + 1, count)} of {count}
        </span>
        <button
          type="button"
          className="meeting-pill meeting-pill--icon observation-carousel-btn observation-carousel-btn--next"
          onClick={() => onIndexChange(safeIndex + 1)}
          disabled={safeIndex >= count - 1}
          aria-label="Next observation"
        >
          <ChevronIcon size={16} />
        </button>
      </div>
    </div>
  );
}