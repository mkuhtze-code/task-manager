'use client';

import { useEffect, useState } from 'react';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import { clampIndex, type CapturedMedia } from '@/lib/meetingCapture';
import { ObservationCapture } from '@/components/MeetingSheets';
import MeetingObservationCarousel from '@/components/MeetingObservationCarousel';
import MeetingObservationGrid from '@/components/MeetingObservationGrid';

// The Observations section: an observation carousel (default) with a grid
// view toggle, the capture surface, and the "N of M" position. The active
// tile travels with the observation set — new observations land at the
// front (created_at desc), so after a save the newest tile is shown.
export default function MeetingObservations(props: {
  observations: MeetingObservation[];
  mediaByObservation: Map<string, MeetingMedia[]>;
  saving: boolean;
  onSaveObservation: (draft: { text: string; media: CapturedMedia[] }) => Promise<boolean>;
  onDelete: (id: string) => void;
  onAddMedia: (observationId: string, captured: CapturedMedia) => Promise<boolean>;
  onSaveEdit: (
    observationId: string,
    text: string,
    removeMediaIds: string[],
    newMedia: CapturedMedia[]
  ) => Promise<boolean>;
}) {
  const { observations, mediaByObservation, saving, onSaveObservation, onDelete, onAddMedia, onSaveEdit } = props;
  const count = observations.length;

  const [view, setView] = useState<'carousel' | 'grid'>('carousel');
  const [index, setIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);

  // Keep the active tile valid when observations are deleted or reloaded.
  useEffect(() => {
    setIndex((i) => clampIndex(i, count));
  }, [count]);

  const setSafeIndex = (i: number) => setIndex(clampIndex(i, count));

  async function handleSaveObservation(draft: { text: string; media: CapturedMedia[] }) {
    const ok = await onSaveObservation(draft);
    // A failed save keeps the capture surface open so nothing is lost; a
    // successful one closes it and shows the newest tile at index 0.
    if (ok) {
      setCapturing(false);
      setIndex(0);
    }
    return ok;
  }

  return (
    <section className="detail-section">
      <div className="detail-section-title-row">
        <div className="detail-section-title">Observations</div>
        <div className="observation-header-actions">
          {count > 0 && (
            <button
              type="button"
              className="meeting-pill"
              onClick={() => setView(view === 'carousel' ? 'grid' : 'carousel')}
              disabled={capturing}
            >
              {view === 'carousel' ? 'Grid' : 'Carousel'}
            </button>
          )}
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setCapturing(true)}
            disabled={capturing || saving}
          >
            + Observation
          </button>
        </div>
      </div>

      {count === 0 && !capturing && <p className="meeting-empty">No evidence captured yet.</p>}

      {count > 0 && view === 'carousel' && (
        <MeetingObservationCarousel
          observations={observations}
          mediaByObservation={mediaByObservation}
          saving={saving}
          index={index}
          onIndexChange={setSafeIndex}
          onDelete={onDelete}
          onAddMedia={onAddMedia}
          onSaveEdit={onSaveEdit}
        />
      )}

      {count > 0 && view === 'grid' && (
        <MeetingObservationGrid
          observations={observations}
          mediaByObservation={mediaByObservation}
          onOpen={(i) => {
            setIndex(i);
            setView('carousel');
          }}
        />
      )}

      {capturing && (
        <ObservationCapture saving={saving} onSave={handleSaveObservation} onCancel={() => setCapturing(false)} />
      )}
    </section>
  );
}