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
  isDesktop?: boolean;
  onDockIt?: () => void;
  /** Plain-language list order (e.g. capacity_first). */
  orderHint?: string | null;
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
    isDesktop = false,
    onDockIt,
    orderHint = null,
  } = props;

  const [capacityOpen, setCapacityOpen] = useState(false);

  const overBy = Math.max(remainingWorkMins - minutesLeftToday, 0);
  const remainingCapacity = Math.max(minutesLeftToday - remainingWorkMins, 0);

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

  /*
   * Desktop is intentionally a different composition from mobile.
   *
   * Today is the capacity surface:
   *   reality → available time → current load → fit
   *
   * The underlying calculations remain owned by TodayPage.
   */

  if (isDesktop) {
    const fitChipLabel = !isWorkDay
      ? 'Off day'
      : overloaded
        ? `Over by ${fmtMins(overBy)}`
        : remainingWorkMins > 0
          ? `${fmtMins(remainingWorkMins)} planned`
          : 'Nothing timed';

    const freeLabel =
      isWorkDay && !overloaded
        ? `${fmtMins(remainingCapacity)} free`
        : isWorkDay
          ? `${fmtMins(minutesLeftToday)} left in day`
          : null;

    return (
      <div
        className={[
          'today-header-card',
          'desk-today-saas',
          overloaded ? 'overloaded' : '',
          capacityOpen ? 'depth-open' : 'depth-closed',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Compact command bar — no GearMenu (product nav owns account) */}
        <div className="desk-today-bar">
          <div className="desk-today-bar-left">
            <div className="desk-today-identity">
              <span className="desk-today-kicker">Today</span>
              <h1 className="desk-today-title">{weekdayLabel}</h1>
              <span className="desk-today-date">{dateOnlyLabel}</span>
            </div>

            <div
              className={[
                'desk-today-fit-chip',
                overloaded ? 'is-over' : 'is-fit',
              ].join(' ')}
              title="How the open work sits against time left today"
            >
              <span className="desk-today-fit-chip-icon" aria-hidden="true">
                {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
              </span>
              <span className="desk-today-fit-chip-copy">
                <strong>{fitChipLabel}</strong>
                {freeLabel ? <span className="desk-today-fit-chip-meta">{freeLabel}</span> : null}
              </span>
            </div>

            {orderHint ? (
              <span className="desk-today-order-hint">{orderHint}</span>
            ) : null}
          </div>

          <div className="desk-today-bar-right">
            {onDockIt ? (
              <button
                type="button"
                className="detail-pill detail-pill-primary desk-today-dock-pill"
                onClick={onDockIt}
              >
                + Dock it
              </button>
            ) : null}

            <button
              type="button"
              className={
                capacityOpen
                  ? 'detail-pill desk-today-depth-toggle is-on'
                  : 'detail-pill desk-today-depth-toggle'
              }
              aria-expanded={capacityOpen}
              onClick={() => setCapacityOpen((v) => !v)}
            >
              {capacityOpen ? 'Hide day depth' : 'Day depth'}
            </button>
          </div>
        </div>

        {/* Depth panel: structure & pressure only — does not repeat the chip */}
        {capacityOpen ? (
          <div className="desk-today-depth">
            {isWorkDay ? (
              <div className="desk-today-depth-rail">
                <div className="desk-today-depth-rail-head">
                  <span>Workday shape</span>
                  <span className="mono">
                    {fmtClock(workStart)} → {fmtClock(workEnd)}
                  </span>
                </div>
                <div className="desk-today-rail">
                  <div
                    className="desk-today-rail-elapsed"
                    style={{ width: `${nowPercent * 100}%` }}
                  />
                  <div
                    className={[
                      'desk-today-rail-load',
                      overloaded ? 'is-over' : '',
                    ].join(' ')}
                    style={{
                      left: `${nowPercent * 100}%`,
                      width: `${planWidthPercent * 100}%`,
                    }}
                  />
                  <div
                    className="desk-today-rail-now"
                    style={{ left: `${nowPercent * 100}%` }}
                  />
                </div>
                <div className="desk-today-depth-rail-foot">
                  <span>Now</span>
                  <span className="mono">{fmtMins(minutesLeftToday)} until end</span>
                  {overloaded ? (
                    <span className="desk-today-rail-warning">
                      Load extends past the day
                    </span>
                  ) : (
                    <span className="mono">{fmtMins(remainingCapacity)} still unallocated</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="desk-today-depth-off">
                Outside your normal working days
                {remainingWorkMins > 0
                  ? ` · ${fmtMins(remainingWorkMins)} still on the plate`
                  : ''}
              </div>
            )}

            {commitments.length > 0 ? (
              <div className="desk-today-depth-commitments">
                <div className="desk-today-depth-section-label">
                  Fixed time
                  <span className="mono">{commitments.length}</span>
                </div>
                <div className="desk-today-commitment-list">
                  {commitments.map((c) => (
                    <div key={c.id} className="desk-today-commitment-item">
                      <span className="desk-today-commitment-title">{c.title}</span>
                      <span className="desk-today-commitment-when mono">
                        {commitmentWindow(c)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {geoAware ? (
              <div className="desk-today-depth-travel">
                <div className="desk-today-depth-section-label">Travel</div>
                <div className="desk-today-depth-travel-body">
                  {recalculatingRoute ? (
                    <span>Updating drive time…</span>
                  ) : hasRoute && routeDriveMins > 0 ? (
                    <span>
                      About {fmtMins(routeDriveMins)} driving
                      {currentBaseLabel
                        ? ` · from ${currentBaseLabel === 'work' ? 'office' : 'home'}`
                        : ''}
                    </span>
                  ) : hasRoute ? (
                    <span>Stops ordered by place</span>
                  ) : (
                    <span>Add places on tasks to include driving</span>
                  )}
                  <div className="desk-today-route-actions">
                    {hasRoute ? (
                      <button
                        type="button"
                        className="desk-today-inline-action"
                        onClick={onViewMap}
                      >
                        Map
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="desk-today-inline-action"
                      onClick={onRecalcRoute}
                      disabled={recalculatingRoute}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                {routeError ? (
                  <span className="desk-today-route-error">{routeError}</span>
                ) : null}
              </div>
            ) : null}

            {showRealityCheck && onRealityCheck ? (
              <div className="desk-today-depth-reality">
                <button type="button" className="btn-text" onClick={onRealityCheck}>
                  Reality check
                </button>
                {realityCheckMessage ? <span>{realityCheckMessage}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  /*
   * Mobile composition.
   * Deliberately retained as the existing compact surface.
   */
  return (
    <div
      className={[
        overloaded ? 'today-header-card overloaded' : 'today-header-card',
      ]
        .filter(Boolean)
        .join(' ')}
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
                      : remainingWorkMins > 0
                        ? `${fmtMins(remainingWorkMins)} planned`
                        : 'Nothing timed'}
                  </span>
                  <span className="today-header-summary-meta">
                    {fmtMins(minutesLeftToday)} time left
                  </span>
                </span>
              </>
            ) : (
              <span className="today-header-summary-copy">
                <span className="today-header-summary-title">
                  Off
                </span>
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

        <div className="today-header-top-right">
          <GearMenu userId={userId} />
        </div>
      </div>

      {orderHint ? (
        <p className="today-fit-order-hint">{orderHint}</p>
      ) : null}

      {commitments.length > 0 && (
        <div className="today-commitments">
          {commitments.map((c) => (
            <span
              key={c.id}
              className="today-commitment"
              title={commitmentWindow(c)}
            >
              <span className="today-commitment-title">
                {c.title}
              </span>

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
                  <div className="header-compare-label">
                    time left
                  </div>
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
                  <div className="header-compare-label">
                    to get done
                  </div>
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
                    <p className="spatial-strip-error">
                      {routeError}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="header-off-row">
              <div className="header-compare-number mono">
                Off
              </div>
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

