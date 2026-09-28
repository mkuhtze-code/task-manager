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
  routeDriveMins?: number;
  onViewMap: () => void;
  userId: string;
  commitments: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
  }>;
  onRealityCheck?: () => void;
  showRealityCheck?: boolean;
  realityCheckMessage?: string | null;
}) {
  const {
    overloaded,
    weekdayLabel,
    dateOnlyLabel,
    isWorkDay,
    minutesLeftToday,
    remainingWorkMins,
    nowPercent,
    planWidthPercent,
    workStart,
    workEnd,
    geoAware,
    recalculatingRoute,
    currentBaseLabel,
    onRecalcRoute,
    routeError,
    hasRoute,
    routeDriveMins = 0,
    onViewMap,
    userId,
    commitments,
    onRealityCheck,
    showRealityCheck,
    realityCheckMessage,
  } = props;

  const [capacityOpen, setCapacityOpen] = useState(false);

  const overBy = remainingWorkMins - minutesLeftToday;

  function commitmentWindow(c: {
    start_at: string;
    end_at: string;
    all_day: boolean;
  }): string {
    if (c.all_day) return 'All day';

    const start = new Date(c.start_at);
    const end = new Date(c.end_at);

    const startLabel = fmtClock(
      `${String(start.getHours()).padStart(2, '0')}:${String(
        start.getMinutes()
      ).padStart(2, '0')}`
    );

    const endLabel = fmtClock(
      `${String(end.getHours()).padStart(2, '0')}:${String(
        end.getMinutes()
      ).padStart(2, '0')}`
    );

    return `${startLabel} – ${endLabel}`;
  }

  return (
    <div
      className={
        overloaded
          ? 'today-header-card overloaded'
          : 'today-header-card'
      }
    >
      <div className="today-header-top-row">
        <button
          type="button"
          className="today-header-summary-toggle"
          onClick={() => setCapacityOpen((v) => !v)}
          aria-expanded={capacityOpen}
          aria-label="Toggle today's details"
        >
          <span className="today-header-date-block">
            <span className="today-header-weekday">{weekdayLabel}</span>
            <span className="today-header-date">{dateOnlyLabel}</span>
          </span>

          <span className="today-header-summary-state">
            {isWorkDay ? (
              <>
                <span
                  className={
                    overloaded
                      ? 'header-fit-icon over'
                      : 'header-fit-icon fits'
                  }
                >
                  {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
                </span>

                <span className="today-header-summary-copy">
                  <span className="today-header-summary-title">
                    {overloaded
                      ? `Over by ${fmtMins(overBy)}`
                      : `On track · ${fmtMins(remainingWorkMins)} to go`}
                  </span>
                  <span className="today-header-summary-meta">
                    {fmtMins(minutesLeftToday)} time left
                  </span>
                </span>
              </>
            ) : (
              <span className="today-header-summary-copy">
                <span className="today-header-summary-title">Off</span>
                <span className="today-header-summary-meta">
                  {fmtMins(remainingWorkMins)} carrying forward
                </span>
              </span>
            )}

            <span
              className={
                capacityOpen
                  ? 'today-capacity-chevron open'
                  : 'today-capacity-chevron'
              }
              aria-hidden="true"
            >
              <ChevronIcon size={14} />
            </span>
          </span>
        </button>

        <div
          className="today-header-top-right"
          onClick={(e) => e.stopPropagation()}
        >
          <GearMenu userId={userId} />
        </div>
      </div>

      {commitments.length > 0 && (
        <div className="today-commitments">
          {commitments.map((c) => (
            <span
              key={c.id}
              className="today-commitment"
              title={commitmentWindow(c)}
            >
              <span className="today-commitment-title">{c.title}</span>
              <span
                className={
                  c.all_day
                    ? 'today-commitment-when all-day'
                    : 'today-commitment-when'
                }
              >
                {commitmentWindow(c)}
              </span>
            </span>
          ))}
        </div>
      )}

      {showRealityCheck && onRealityCheck && (
        <div className="today-reality-row">
          <button
            type="button"
            className="btn-text"
            onClick={(e) => {
              e.stopPropagation();
              onRealityCheck();
            }}
          >
            Reality check
          </button>

          {realityCheckMessage && (
            <span className="today-reality-msg">
              {realityCheckMessage}
            </span>
          )}
        </div>
      )}

      {capacityOpen && (
        <div className="today-capacity-detail">
          {isWorkDay ? (
            <>
              <div className="header-compare-row">
                <div className="header-compare-stat">
                  <div className="header-compare-number mono">
                    {fmtMins(minutesLeftToday)}
                  </div>
                  <div className="header-compare-label">time left</div>
                </div>

                <div className="header-compare-stat">
                  <div
                    className={
                      overloaded
                        ? 'header-compare-number mono over'
                        : 'header-compare-number mono'
                    }
                  >
                    {fmtMins(remainingWorkMins)}
                  </div>
                  <div className="header-compare-label">to get done</div>
                </div>
              </div>

              <div className="day-rail-wrap">
                <div className="day-rail-track">
                  <div
                    className="day-rail-elapsed"
                    style={{ width: `${nowPercent * 100}%` }}
                  />

                  <div
                    className={
                      overloaded
                        ? 'day-rail-plan over'
                        : 'day-rail-plan'
                    }
                    style={{
                      left: `${nowPercent * 100}%`,
                      width: `${planWidthPercent * 100}%`,
                    }}
                  />

                  <div
                    className="day-rail-now-dot"
                    style={{ left: `${nowPercent * 100}%` }}
                  />
                </div>

                <div className="day-rail-labels">
                  <span>{fmtClock(workStart)}</span>

                  {overloaded && (
                    <span className="day-rail-overflow-label">
                      +{fmtMins(overBy)}
                    </span>
                  )}

                  <span>{fmtClock(workEnd)}</span>
                </div>
              </div>

              {geoAware && (
                <div
                  className="spatial-strip"
                  onClick={(e) => e.stopPropagation()}
                >
                  {recalculatingRoute ? (
                    <p className="spatial-strip-summary">
                      Updating drive times…
                    </p>
                  ) : hasRoute && routeDriveMins > 0 ? (
                    <p className="spatial-strip-summary">
                      About {fmtMins(routeDriveMins)} driving
                      {currentBaseLabel
                        ? ` · from ${
                            currentBaseLabel === 'work'
                              ? 'office'
                              : 'home'
                          }`
                        : ''}
                    </p>
                  ) : hasRoute ? (
                    <p className="spatial-strip-summary">
                      Order set by location
                    </p>
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
            </>
          ) : (
            <div className="header-off-row">
              <div className="header-compare-number mono">Off</div>
              <div className="header-compare-label">
                {fmtMins(remainingWorkMins)} carrying forward
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
