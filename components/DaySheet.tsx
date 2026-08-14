'use client';

import { CloseIcon, ChevronIcon, BedIcon, MapPinIcon } from '@/components/icons';

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

  hasRoute: boolean;
  sortMode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual';
  onChangeSortMode: (mode: 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual') => void;
  onOpenAccommodation: () => void;
  onOpenMap: () => void;
  onClose: () => void;
};

// The day's overview, reached by tapping the compact day line. Everything
// that describes the day as a whole — whether it fits, which day you're
// looking at, how it's arranged, where you're staying, and the route —
// lives here instead of as permanent chrome on the page.
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
            <div className="day-sheet-cap-row">
              <span className={overloaded ? 'day-sheet-cap-status over' : 'day-sheet-cap-status'}>
                {overloaded ? `Over by ${fmtMins(-spareMins)}` : `Fits · ${fmtMins(spareMins)} spare`}
              </span>
              <span className="day-sheet-cap-stats mono">
                {fmtMins(plannedMins)} planned · {fmtMins(minutesLeftToday)} {isToday ? 'left' : 'in the day'}
              </span>
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
            </div>
            {overloaded && <p className="day-sheet-cap-warn">Trim or move a stop to fit it in.</p>}
          </div>
        )}

        <div className="day-sheet-section">
          <div className="day-toggle-row" style={{ overflowX: 'auto', width: '100%' }}>
            {tripDays.map((d) => {
              const label = fmtDayLabel(d.date);
              return (
                <button
                  key={d.id}
                  className={d.id === selectedDayId ? 'day-toggle-btn pill active' : 'day-toggle-btn pill'}
                  onClick={() => { onSelectDay(d.id); onClose(); }}
                >
                  {label.weekday} {label.date}
                </button>
              );
            })}
          </div>
        </div>

        <div className="day-sheet-section">
          <div className="day-sheet-arrange">
            <span className="day-sheet-arrange-label">Arrange</span>
            <div className="segmented">
              <button className={sortMode === 'manual' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('manual')}>Manual</button>
              <button className={sortMode === 'what_fits' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('what_fits')}>What fits</button>
              <button className={sortMode === 'close_to_accom' || sortMode === 'nearby_me' ? 'segmented-btn active' : 'segmented-btn'} onClick={() => onChangeSortMode('close_to_accom')}>Near stay</button>
            </div>
          </div>
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
