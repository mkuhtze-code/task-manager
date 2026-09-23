'use client';

import { CloseIcon, ChevronIcon, BedIcon, MapPinIcon, CompassIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDayLabel(dateStr: string): { weekday: string; date: string } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

export type DaySheetPresenceSummary = {
  mode: 'none' | 'all_day' | 'work_hours' | 'work_block';
  workStopCount: number;
  totalStops: number;
  summaryLabel: string | null;
};

type DaySheetProps = {
  dayIndex: number;
  tripDays: { id: string; date: string }[];
  selectedDayId: string;
  onSelectDay: (id: string) => void;

  hasActivities: boolean;
  overloaded: boolean;
  spareMins: number;
  plannedMins: number;
  minutesLeftToday: number;
  isToday: boolean;
  nowPercent: number;
  planWidthPercent: number;

  presence?: DaySheetPresenceSummary | null;
  stayLabel?: string | null;
  meetingCount?: number;

  hasRoute: boolean;
  sortMode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual';
  onChangeSortMode: (mode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual') => void;
  onOpenAccommodation: () => void;
  onOpenMap: () => void;
  onOpenLibrary: () => void;
  onClose: () => void;
};

/** Day command centre — fit, presence, stay, arrange, deep links. */
export default function DaySheet(props: DaySheetProps) {
  const {
    dayIndex,
    tripDays,
    selectedDayId,
    onSelectDay,
    hasActivities,
    overloaded,
    spareMins,
    plannedMins,
    minutesLeftToday,
    isToday,
    nowPercent,
    planWidthPercent,
    presence,
    stayLabel,
    meetingCount,
    hasRoute,
    sortMode,
    onChangeSortMode,
    onOpenAccommodation,
    onOpenMap,
    onOpenLibrary,
    onClose,
  } = props;

  const selected = tripDays.find((d) => d.id === selectedDayId);
  const dialogRef = useDialogA11y(onClose);
  const label = selected ? fmtDayLabel(selected.date) : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet day-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Day shape"
      >
        <div className="task-detail-header">
          <div className="settings-panel-title">
            {label ? `${label.weekday} ${label.date}` : 'Day'}
            <span className="day-sheet-day-pos">
              {' '}
              · Day {dayIndex + 1} of {tripDays.length}
            </span>
          </div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="job-detail-kicker">Day shape</p>

        <div className="stop-context-strip">
          {hasActivities ? (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Fit</span>
              <span className={overloaded ? 'day-sheet-cap-status over' : undefined}>
                {overloaded
                  ? `Over by ${fmtMins(-spareMins)}`
                  : `Fits · ${fmtMins(spareMins)} spare`}
                {' · '}
                <span className="mono">
                  {fmtMins(plannedMins)} planned
                  {isToday ? ` · ${fmtMins(minutesLeftToday)} left` : ''}
                </span>
              </span>
            </div>
          ) : (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Fit</span>
              <span>No stops yet — add where you'll be</span>
            </div>
          )}

          {presence && presence.mode !== 'none' && presence.summaryLabel && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Presence</span>
              <span>
                {presence.summaryLabel}
                {presence.workStopCount > 0
                  ? ` · ${presence.workStopCount} work stop${presence.workStopCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>
          )}

          {stayLabel && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Stay</span>
              <span>{stayLabel}</span>
            </div>
          )}

          {typeof meetingCount === 'number' && meetingCount > 0 && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Meetings</span>
              <span>
                {meetingCount} on this day
                {isToday ? ' · also on Today capacity' : ''}
              </span>
            </div>
          )}

          {hasActivities && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Stops</span>
              <span>
                {presence?.totalStops ?? '—'}
                {hasRoute ? ' · route mapped' : ' · add places for drives'}
              </span>
            </div>
          )}
        </div>

        {hasActivities && (
          <div className="day-sheet-cap">
            <div className="day-rail-wrap">
              <div className="day-rail-track">
                {isToday && (
                  <div className="day-rail-elapsed" style={{ width: `${nowPercent * 100}%` }} />
                )}
                <div
                  className={overloaded ? 'day-rail-plan over' : 'day-rail-plan'}
                  style={{
                    left: `${nowPercent * 100}%`,
                    width: `${Math.max(planWidthPercent, 0) * 100}%`,
                  }}
                />
                {isToday && (
                  <div className="day-rail-now-dot" style={{ left: `${nowPercent * 100}%` }} />
                )}
              </div>
            </div>
            {overloaded && (
              <p className="day-sheet-cap-warn">Trim or move a stop so the day fits.</p>
            )}
          </div>
        )}

        <div className="day-sheet-section">
          <span className="settings-label">Jump to day</span>
          <div className="day-toggle-row" style={{ overflowX: 'auto', width: '100%' }}>
            {tripDays.map((d) => {
              const dl = fmtDayLabel(d.date);
              return (
                <button
                  key={d.id}
                  type="button"
                  className={
                    d.id === selectedDayId ? 'day-toggle-btn pill active' : 'day-toggle-btn pill'
                  }
                  onClick={() => {
                    onSelectDay(d.id);
                    onClose();
                  }}
                >
                  {dl.weekday} {dl.date}
                </button>
              );
            })}
          </div>
        </div>

        <div className="day-sheet-section">
          <span className="settings-label">Arrange stops</span>
          <div className="day-toggle-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {(
              [
                { id: 'manual' as const, label: 'Manual' },
                { id: 'what_fits' as const, label: 'What fits' },
                { id: 'close_to_accom' as const, label: 'Near stay' },
                { id: 'nearby_me' as const, label: 'Near me' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={
                  sortMode === opt.id ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'
                }
                onClick={() => onChangeSortMode(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="day-sheet-links">
          <button type="button" className="day-sheet-link" onClick={onOpenAccommodation}>
            <BedIcon />
            <span>{stayLabel ? 'Edit stay' : 'Set stay'}</span>
            <ChevronIcon size={14} />
          </button>
          <button type="button" className="day-sheet-link" onClick={onOpenMap} disabled={!hasRoute}>
            <MapPinIcon />
            <span>{hasRoute ? 'Map of the day' : 'Add a place to see the map'}</span>
            <ChevronIcon size={14} />
          </button>
          <button type="button" className="day-sheet-link" onClick={onOpenLibrary}>
            <CompassIcon />
            <span>Library</span>
            <ChevronIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
