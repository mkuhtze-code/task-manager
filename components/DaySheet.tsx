'use client';

import { CloseIcon, ChevronIcon, BedIcon, MapPinIcon, FitCheckIcon, FitWarnIcon } from '@/components/icons';

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtClock(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function fmtMinutesClock(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return fmtClock(`${h}:${String(m).padStart(2, '0')}`);
}

function fmtDayLabel(dateStr: string): { weekday: string; date: string } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

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
  projectedFinishMinutes: number;
  effectiveDayStart: string;
  effectiveDayEnd: string;

  hasRoute: boolean;
  sortMode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual';
  onChangeSortMode: (mode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual') => void;
  onOpenAccommodation: () => void;
  onOpenMap: () => void;
  onClose: () => void;
};

// The day's overview, reached by tapping the compact day line. Everything
// that describes the day as a whole — whether it fits, how the sequence is
// arranged, where the user is staying, and how to see the route — lives
// here instead of as permanent chrome on the page.
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
    projectedFinishMinutes,
    effectiveDayStart,
    effectiveDayEnd,
    hasRoute,
    sortMode,
    onChangeSortMode,
    onOpenAccommodation,
    onOpenMap,
    onClose,
  } = props;

  const selected = tripDays.find((d) => d.id === selectedDayId);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet day-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">
            {selected ? `${fmtDayLabel(selected.date).weekday} ${fmtDayLabel(selected.date).date}` : 'Day'}
            <span className="day-sheet-day-pos"> · Day {dayIndex + 1} of {tripDays.length}</span>
          </div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {hasActivities && (
          <div className="day-sheet-cap">
            <div className="day-sheet-cap-statement">
              {overloaded ? (
                <>
                  <FitWarnIcon />
                  <span className="over">Over by {fmtMins(-spareMins)}</span>
                </>
              ) : (
                <>
                  <FitCheckIcon />
                  <span>Fits — {fmtMins(spareMins)} to spare</span>
                </>
              )}
            </div>

            <div className="day-sheet-cap-numbers">
              <div className="day-sheet-cap-stat">
                <span className="mono day-sheet-cap-num">{fmtMins(plannedMins)}</span>
                <span className="day-sheet-cap-label">planned</span>
              </div>
              <div className="day-sheet-cap-stat">
                <span className="mono day-sheet-cap-num">{fmtMins(minutesLeftToday)}</span>
                <span className="day-sheet-cap-label">{isToday ? 'time left' : 'day length'}</span>
              </div>
            </div>

            <div className="day-rail-wrap">
              <div className="day-rail-track">
                {isToday && <div className="day-rail-elapsed" style={{ width: `${nowPercent * 100}%` }} />}
                <div
                  className={overloaded ? 'day-rail-plan over' : 'day-rail-plan'}
                  style={{ left: `${nowPercent * 100}%`, width: `${Math.max(planWidthPercent, 0) * 100}%` }}
                />
                {isToday && <div className="day-rail-now-dot" style={{ left: `${nowPercent * 100}%` }} />}
              </div>
              <div className="day-rail-labels">
                <span>{fmtClock(effectiveDayStart)}</span>
                <span>the plan runs to ~{fmtMinutesClock(projectedFinishMinutes)}</span>
                <span>{fmtClock(effectiveDayEnd)}</span>
              </div>
            </div>

            {overloaded && (
              <p className="day-sheet-cap-warn">
                {fmtMins(-spareMins)} over — trim a stop, shorten a flexible stop, or move something to another day.
              </p>
            )}
          </div>
        )}

        <div className="day-sheet-section day-sheet-section-days">
          <div className="day-sheet-section-title">Days</div>
          <div className="priority-option-list">
            {tripDays.map((d, i) => {
              const label = fmtDayLabel(d.date);
              return (
                <button
                  key={d.id}
                  className={d.id === selectedDayId ? 'priority-option active day-sheet-day' : 'priority-option day-sheet-day'}
                  onClick={() => { onSelectDay(d.id); onClose(); }}
                >
                  <span className="priority-option-label">
                    Day {i + 1} — {label.weekday} {label.date}
                  </span>
                  {d.id === selectedDayId && <span className="day-sheet-day-now">open</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="day-sheet-section">
          <div className="day-sheet-section-title">Arrange the day</div>
          <div className="segmented">
            <button className={sortMode === 'manual' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('manual')}>Manual</button>
            <button className={sortMode === 'what_fits' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('what_fits')}>What fits</button>
            <button className={sortMode === 'close_to_accom' || sortMode === 'nearby_me' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('close_to_accom')}>Near stay</button>
          </div>
          <p className="settings-help day-sheet-help">
            {sortMode === 'manual'
              ? 'Stops stay exactly where you put them.'
              : sortMode === 'what_fits'
                ? 'Dokkit leads with the shorter stops so the day fills predictably.'
                : 'Dokkit leads with the stops closest to where you are staying.'}
          </p>
        </div>

        <div className="day-sheet-links">
          <button className="day-sheet-link" onClick={onOpenAccommodation}>
            <BedIcon />
            <span>Where you&apos;re staying</span>
            <ChevronIcon size={14} />
          </button>
          <button className="day-sheet-link" onClick={hasRoute ? onOpenMap : undefined} disabled={!hasRoute}>
            <MapPinIcon />
            <span>{hasRoute ? 'Map of the day' : 'Add a location to see the map'}</span>
            <ChevronIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}