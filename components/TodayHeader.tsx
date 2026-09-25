'use client';

import { useState } from 'react';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';
import { ChevronIcon, FitCheckIcon, FitWarnIcon } from '@/components/icons';

export function TodayHeader(props: {
  overloaded: boolean;
  weekdayLabel: string;
  dateOnlyLabel: string;
  isWorkDay: boolean;
  minutesLeftToday: number;
  remainingWorkMins: number;
  nowPercent: number;
  planWidthPercent: number;
  workStart: string;
  workEnd: string;
  geoAware: boolean;
  recalculatingRoute: boolean;
  currentBaseLabel: string | null;
  onRecalcRoute: () => void;
  routeError: string | null;
  hasRoute: boolean;
  /** Total drive minutes in the current geo plan; 0 if unknown. */
  routeDriveMins?: number;
  onViewMap: () => void;
  // Forwarded to GearMenu so it can skip its own getSession() lookup —
  // Today already knows who is signed in.
  userId: string;
  // External commitments (synced calendar events) for today, oldest first.
  commitments: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
  }>;
  // Optional end-of-day Reality Check entry (shown near work end).
  onRealityCheck?: () => void;
  showRealityCheck?: boolean;
  realityCheckMessage?: string | null;
}) {
  const {
    overloaded, weekdayLabel, dateOnlyLabel, isWorkDay, minutesLeftToday,
    remainingWorkMins, nowPercent, planWidthPercent, workStart, workEnd, geoAware,
    recalculatingRoute, currentBaseLabel, onRecalcRoute, routeError, hasRoute, routeDriveMins = 0, onViewMap, userId,
    commitments,
    onRealityCheck,
    showRealityCheck,
    realityCheckMessage,
  } = props;

  const [capacityOpen, setCapacityOpen] = useState(false);

  const overBy = remainingWorkMins - minutesLeftToday;

  function commitmentWindow(c: { start_at: string; end_at: string; all_day: boolean }): string {
    if (c.all_day) return 'All day';
    const start = new Date(c.start_at);
    const end = new Date(c.end_at);
    const startLabel = fmtClock(
      `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    );
    const endLabel = fmtClock(
      `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
    );
    return `${startLabel} – ${endLabel}`;
  }

  return (
    <div className={overloaded ? 'today-header-card overloaded' : 'today-header-card'}>
      <div className="today-header-top-row">
        <div className="today-header-date-block">
          <div className="today-header-weekday">{weekdayLabel}</div>
          <div className="today-header-date">{dateOnlyLabel}</div>
        </div>
        <div className="today-header-top-right">
          <GearMenu userId={userId} />
        </div>
      </div>

      {commitments.length > 0 && (
        <div className="today-commitments">
          {commitments.map((c) => (
            <span key={c.id} className="today-commitment" title={commitmentWindow(c)}>
              <span className="today-commitment-title">{c.title}</span>
              <span className={c.all_day ? 'today-commitment-when all-day' : 'today-commitment-when'}>
                {commitmentWindow(c)}
              </span>
            </span>
          ))}
        </div>
      )}

      {isWorkDay ? (
        <div className="today-capacity">
          <button
            className={overloaded ? 'today-capacity-toggle over' : 'today-capacity-toggle'}
            onClick={() => setCapacityOpen((v) => !v)}
            aria-expanded={capacityOpen}
            aria-label="Toggle capacity details"
          >
            <span className="today-capacity-summary">
              <span className={overloaded ? 'header-fit-icon over' : 'header-fit-icon fits'}>
                {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
              </span>
              <span className="today-capacity-title">
                {overloaded
                  ? `Over by ${fmtMins(overBy)}`
                  : `On track · ${fmtMins(remainingWorkMins)} to go`}
              </span>
            </span>
            <span
              className={capacityOpen ? 'today-capacity-chevron open' : 'today-capacity-chevron'}
              aria-hidden="true"
            >
              <ChevronIcon size={14} />
            </span>
          </button>

          {showRealityCheck && onRealityCheck && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn-text"
                style={{ padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRealityCheck();
                }}
              >
                Reality check
              </button>
              {realityCheckMessage && (
                <span
                  className="settings-help"
                  style={{ color: 'var(--moss-text, var(--moss))', margin: 0 }}
                >
                  {realityCheckMessage}
                </span>
              )}
            </div>
          )}

          {capacityOpen && (
            <div className="today-capacity-detail">
              <div className="header-compare-row">
                <div className="header-compare-stat">
                  <div className="header-compare-number mono">{fmtMins(minutesLeftToday)}</div>
                  <div className="header-compare-label">time left</div>
                </div>
                <div className="header-compare-stat">
                  <div className={overloaded ? 'header-compare-number mono over' : 'header-compare-number mono'}>
                    {fmtMins(remainingWorkMins)}
                  </div>
                  <div className="header-compare-label">to get done</div>
                </div>
              </div>

              <div className="day-rail-wrap">
                <div className="day-rail-track">
                  <div className="day-rail-elapsed" style={{ width: `${nowPercent * 100}%` }} />
                  <div
                    className={overloaded ? 'day-rail-plan over' : 'day-rail-plan'}
                    style={{ left: `${nowPercent * 100}%`, width: `${planWidthPercent * 100}%` }}
                  />
                  <div className="day-rail-now-dot" style={{ left: `${nowPercent * 100}%` }} />
                </div>
                <div className="day-rail-labels">
                  <span>{fmtClock(workStart)}</span>
                  {overloaded && (
                    <span className="day-rail-overflow-label">+{fmtMins(overBy)}</span>
                  )}
                  <span>{fmtClock(workEnd)}</span>
                </div>
              </div>

              {geoAware && (
                <div className="spatial-strip" onClick={(e) => e.stopPropagation()}>
                  {recalculatingRoute ? (
                    <p className="spatial-strip-summary">Updating drive times…</p>
                  ) : hasRoute && routeDriveMins > 0 ? (
                    <p className="spatial-strip-summary">
                      About {fmtMins(routeDriveMins)} driving
                      {currentBaseLabel
                        ? ` · from ${currentBaseLabel === 'work' ? 'office' : 'home'}`
                        : ''}
                    </p>
                  ) : hasRoute ? (
                    <p className="spatial-strip-summary">Order set by location</p>
                  ) : (
                    <p className="spatial-strip-summary">
                      Add places on tasks to include driving
                    </p>
                  )}
                  <div className="spatial-strip-actions">
                    {hasRoute && (
                      <button
                        type="button"
                        className="spatial-strip-action"
                        onClick={onViewMap}
                      >
                        Map
                      </button>
                    )}
                    <button
                      type="button"
                      className="spatial-strip-action"
                      onClick={onRecalcRoute}
                      disabled={recalculatingRoute}
                    >
                      Refresh
                    </button>
                  </div>
                  {routeError && (
                    <p className="spatial-strip-error">{routeError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="header-off-row">
          <div className="header-compare-number mono">Off</div>
          <div className="header-compare-label">{fmtMins(remainingWorkMins)} carrying forward</div>
          {showRealityCheck && onRealityCheck && (
            <button
              type="button"
              className="btn-text"
              style={{ padding: 0, marginLeft: 8 }}
              onClick={onRealityCheck}
            >
              Reality check
            </button>
          )}
        </div>
      )}
    </div>
  );
}
