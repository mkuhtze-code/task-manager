'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import { clampIndex, type CapturedMedia } from '@/lib/meetingCapture';
import { ObservationCapture } from '@/components/MeetingSheets';
import MeetingObservationCarousel from '@/components/MeetingObservationCarousel';
import MeetingObservationGrid from '@/components/MeetingObservationGrid';

// The Observations section: an observation carousel (default) with a grid
// view toggle, the capture surface, and the "N of M" position. The active
// observation draft and the open/closed capture state are owned by the
// meeting PAGE (mirrored to sessionStorage) and passed in as props, so this
// section can unmount and remount — the on-page loading gate does this on
// every load, and the OS camera/file picker path can even reload the whole
// page — without cancelling the draft. The hidden photo input is rendered
// below UNGATED by capture state, so it (and the handshake callback behind
// it) survive the picker lifecycle.
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
  capturing: boolean;
  onStartObservation: () => void;
  draftText: string;
  draftMedia: CapturedMedia[];
  recording: boolean;
  captureError: string | null;
  onTextChange: (text: string) => void;
  onAddPhoto: () => void;
  onToggleVoice: () => void;
  onRemoveDraftMedia: (index: number) => void;
  onCancelObservation: () => void;
  photoInputRef: RefObject<HTMLInputElement>;
  onPhotoInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const {
    observations,
    mediaByObservation,
    saving,
    onSaveObservation,
    onDelete,
    onAddMedia,
    onSaveEdit,
    capturing,
    onStartObservation,
    draftText,
    draftMedia,
    recording,
    captureError,
    onTextChange,
    onAddPhoto,
    onToggleVoice,
    onRemoveDraftMedia,
    onCancelObservation,
    photoInputRef,
    onPhotoInputChange,
  } = props;

  const sortedObservations = useMemo(() => {
    return [...observations].sort((a, b) => {
      const timeA = a.created_at || a.captured_at || '';
      const timeB = b.created_at || b.captured_at || '';
      if (timeA !== timeB) {
        return timeB.localeCompare(timeA);
      }
      return b.id.localeCompare(a.id);
    });
  }, [observations]);

  const count = sortedObservations.length;

  const [view, setView] = useState<'carousel' | 'grid'>('carousel');
  const [index, setIndex] = useState(0);

  // Keep the active tile valid when observations are deleted or reloaded.
  useEffect(() => {
    setIndex((i) => clampIndex(i, count));
  }, [count]);

  const setSafeIndex = (i: number) => setIndex(clampIndex(i, count));

  // A failed save keeps the capture surface open so nothing is lost; a
  // successful one closes it (the page completes the draft) and shows the
  // newest tile at index 0 — observations are ordered created_at desc.
  async function handleSaveObservation(draft: { text: string; media: CapturedMedia[] }) {
    const ok = await onSaveObservation(draft);
    if (ok) setIndex(0);
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
            onClick={onStartObservation}
            disabled={capturing || saving}
          >
            + Observation
          </button>
        </div>
      </div>

      {capturing && (
        <ObservationCapture
          saving={saving}
          text={draftText}
          media={draftMedia}
          recording={recording}
          captureError={captureError}
          onTextChange={onTextChange}
          onAddPhoto={onAddPhoto}
          onToggleVoice={onToggleVoice}
          onRemoveMedia={onRemoveDraftMedia}
          onSave={handleSaveObservation}
          onCancel={onCancelObservation}
        />
      )}

      {count === 0 && !capturing && <p className="meeting-empty">No evidence captured yet.</p>}

      {count > 0 && view === 'carousel' && (
        <MeetingObservationCarousel
          observations={sortedObservations}
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
          observations={sortedObservations}
          mediaByObservation={mediaByObservation}
          onOpen={(i) => {
            setIndex(i);
            setView('carousel');
          }}
        />
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onPhotoInputChange}
      />
    </section>
  );
}
