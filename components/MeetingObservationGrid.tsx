'use client';

import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import MeetingObservationTile from '@/components/MeetingObservationTile';

// The compact, at-a-glance layout: one tile per observation, tap to open it
// in the observation carousel. Grid tiles never nest the full photo
// carousel — a multi-photo observation shows its first photo plus a
// "1/N" chip.
export default function MeetingObservationGrid(props: {
  observations: MeetingObservation[];
  mediaByObservation: Map<string, MeetingMedia[]>;
  onOpen: (index: number) => void;
}) {
  const { observations, mediaByObservation, onOpen } = props;
  if (observations.length === 0) return null;
  return (
    <div className="observation-grid">
      {observations.map((o, i) => (
        <MeetingObservationTile
          key={o.id}
          observation={o}
          media={mediaByObservation.get(o.id) ?? []}
          saving={false}
          variant="grid"
          onOpen={() => onOpen(i)}
          position={i + 1}
          total={observations.length}
        />
      ))}
    </div>
  );
}