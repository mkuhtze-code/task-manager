'use client';

import type { CSSProperties, PointerEvent } from 'react';
import { CheckIcon, DragHandleIcon, LockIcon, MapPinIcon } from '@/components/icons';
import { TravelLeg } from '@/components/TravelLeg';
import { formatStopGlance, type StopKind, type StopPresence } from '@/lib/travelStopTypes';

export type TripStopRowActivity = {
  id: string;
  text: string;
  activity_type: 'stop' | 'drive' | 'flight' | 'other';
  estimate_mins: number;
  drive_mins_to_next: number;
  location_text: string | null;
  lat: number | null;
  stop_kind?: StopKind | null;
  presence?: StopPresence | null;
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
};

type Props = {
  activity: TripStopRowActivity;
  flightDetailLabel: string | null;
  rowStyle: CSSProperties;
  conflict: boolean;
  routeUnverifiable: boolean;
  manualSort: boolean;
  workLabel: string | null;
  driveGlanceLabel: string | null;
  driveLabel: string | null;
  driveDetail: string | null;
  mapsUrl: string | null;
  onComplete: () => void;
  onOpen: () => void;
  onNearbyDrive: () => void;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  fmtMins: (n: number) => string;
  fmtClock: (t: string) => string;
  onRowRef?: (el: HTMLDivElement | null) => void;
};

function shortKind(kind: StopKind | null | undefined): string {
  switch (kind || 'leisure') {
    case 'work': return 'Work';
    case 'food': return 'Food';
    case 'stay': return 'Stay';
    case 'other': return 'Other';
    default: return 'Place';
  }
}

export default function TripStopRow({
  activity: a, flightDetailLabel, rowStyle, conflict, routeUnverifiable, manualSort, workLabel, driveGlanceLabel,
  driveLabel, driveDetail, mapsUrl, onComplete, onOpen, onNearbyDrive,
  onPointerDown, onPointerMove, onPointerUp, fmtMins, fmtClock, onRowRef,
}: Props) {
  return (
    <div ref={onRowRef} style={rowStyle} className="ins-travel-stop-row">
      <div className={['task-row', a.activity_type === 'stop' ? '' : 'task-list-item', conflict ? 'conflict' : ''].filter(Boolean).join(' ')}>
        <div className="task-main ins-travel-stop-row__main">
          <button className="check-btn" onClick={(e) => { e.stopPropagation(); onComplete(); }} aria-label="Mark complete">
            <CheckIcon done={false} />
          </button>
          <div className="task-body ins-travel-stop-row__body" onClick={onOpen}>
            <div className="task-text ins-travel-stop-row__title">
              <span className="stop-kind-mark ins-travel-stop-row__kind">{shortKind(a.stop_kind)}</span>
              {a.text}
            </div>
            {((a.location_text && a.lat == null) || conflict || routeUnverifiable) && (
              <div className="activity-meta ins-travel-stop-row__meta">
                {a.location_text && a.lat == null && (
                  <span className="activity-meta-loc" title={a.location_text}>
                    <MapPinIcon size={12} />
                    <span className="activity-meta-loc-text">{a.location_text}</span>
                    <span className="activity-meta-hint">· not mapped</span>
                  </span>
                )}
                {conflict && <span className="activity-meta-conflict">won't make it</span>}
                {!conflict && routeUnverifiable && <span className="trip-stop-drive-unknown">drive time unverified</span>}
              </div>
            )}
            {a.activity_type === 'flight' && flightDetailLabel && <div className="trip-stop-work-label">{flightDetailLabel}</div>}
            {workLabel && <div className="trip-stop-work-label">{workLabel}</div>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="trip-stop-maps-link ins-travel-stop-row__maps" onClick={(e) => e.stopPropagation()}>Open in Maps ↗</a>}
          </div>
          <span className={conflict ? 'activity-glance conflict mono ins-travel-stop-row__glance' : 'activity-glance mono ins-travel-stop-row__glance'}>
            {formatStopGlance({
              presence: a.presence, time_type: a.time_type, fixed_time: a.fixed_time,
              estimate_mins: a.estimate_mins, fmtMins, fmtClock,
            })}
            {driveGlanceLabel && <span className="trip-stop-drive-unknown"> · drive {driveGlanceLabel}</span>}
          </span>
          {a.activity_type !== 'flight' && a.time_type === 'flexible' && manualSort ? (
            <button className="drag-handle-btn ins-travel-stop-row__handle" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e); }}
              onPointerMove={(e) => { e.stopPropagation(); onPointerMove(e); }}
              onPointerUp={(e) => { e.stopPropagation(); onPointerUp(); }}
              onPointerCancel={(e) => { e.stopPropagation(); onPointerUp(); }} aria-label="Drag to reorder">
              <DragHandleIcon />
            </button>
          ) : a.time_type === 'fixed' || a.activity_type === 'flight' ? (
            <span className="drag-handle-btn ins-travel-stop-row__handle"
              title="Fixed time — locked in place" aria-label="Fixed time, locked in place"><LockIcon /></span>
          ) : null}
        </div>
        {driveLabel && driveDetail && (
          <TravelLeg label={driveLabel} detail={driveDetail}
            action={<button onClick={onNearbyDrive} aria-label="Find something nearby on this drive">Nearby</button>} />
        )}
      </div>
    </div>
  );
}
