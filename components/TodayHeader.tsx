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
    return (
      <div
        className={[
          'today-header-card',
          'desk-today-capacity-dashboard',
          overloaded ? 'overloaded' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="desk-today-dashboard-top">
          <div className="desk-today-dashboard-title">
            <span className="desk-today-dashboard-kicker">Today</span>

            <div className="desk-today-dashboard-heading-row">
              <h1>{weekdayLabel}</h1>
              <span className="desk-today-dashboard-date">
                {dateOnlyLabel}
              </span>
            </div>

            <p className="desk-today-dashboard-subtitle">
              {isWorkDay
                ? 'Your available time and everything currently competing for it.'
                : 'Today is outside your normal working days.'}
            </p>
            {orderHint ? (
              <p className="today-fit-order-hint" style={{ padding: 0, marginTop: 6 }}>
                {orderHint}
              </p>
            ) : null}
          </div>

          <div className="desk-today-dashboard-actions">
            {onDockIt ? (
              <button
                type="button"
                className="btn btn-steel desk-today-dock"
                onClick={onDockIt}
              >
                + Dock it
              </button>
            ) : null}

            <GearMenu userId={userId} />
          </div>
        </div>

        {isWorkDay ? (
          <>
            <div className="desk-today-capacity-hero">
              <div className="desk-today-capacity-primary">
                <span className="desk-today-capacity-label">
                  Time available
                </span>

                <strong className="desk-today-capacity-number mono">
                  {fmtMins(minutesLeftToday)}
                </strong>

                <span className="desk-today-capacity-context">
                  remaining in your workday
                </span>
              </div>

              <div
                className={[
                  'desk-today-fit',
                  overloaded ? 'is-over' : 'is-fit',
                ].join(' ')}
              >
                <span className="desk-today-fit-icon" aria-hidden="true">
                  {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
                </span>

                <span className="desk-today-fit-copy">
                  <strong>
                    {overloaded
                      ? `Over capacity by ${fmtMins(overBy)}`
                      : remainingCapacity > 0
                        ? `${fmtMins(remainingCapacity)} remaining`
                        : 'At capacity'}
                  </strong>

                  <span>
                    {overloaded
                      ? 'Some work will need to move or take longer.'
                      : remainingCapacity > 0
                        ? 'There is still room in today.'
                        : 'Your available time is fully accounted for.'}
                  </span>
                </span>
              </div>
            </div>

            <div className="desk-today-capacity-model">
              <div className="desk-today-capacity-stat">
                <span>Time left</span>
                <strong className="mono">
                  {fmtMins(minutesLeftToday)}
                </strong>
                <small>workday</small>
              </div>

              <div className="desk-today-capacity-divider" />

              <div className="desk-today-capacity-stat">
                <span>Plan load</span>
                <strong
                  className={[
                    'mono',
                    overloaded ? 'is-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {fmtMins(remainingWorkMins)}
                </strong>
                <small>work + commitments</small>
              </div>

              <div className="desk-today-capacity-divider" />

              <div className="desk-today-capacity-stat">
                <span>Remaining</span>
                <strong
                  className={[
                    'mono',
                    overloaded ? 'is-over' : 'is-positive',
                  ].join(' ')}
                >
                  {overloaded
                    ? `−${fmtMins(overBy)}`
                    : fmtMins(remainingCapacity)}
                </strong>
                <small>
                  {overloaded ? 'needs attention' : 'unallocated'}
                </small>
              </div>
            </div>

            <div className="desk-today-rail-section">
              <div className="desk-today-rail-head">
                <span>Your workday</span>

                <span className="desk-today-rail-times mono">
                  {fmtClock(workStart)} <span>→</span> {fmtClock(workEnd)}
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

              <div className="desk-today-rail-foot">
                <span>elapsed</span>

                {overloaded ? (
                  <span className="desk-today-rail-warning">
                    +{fmtMins(overBy)} beyond available time
                  </span>
                ) : (
                  <span>
                    {fmtMins(remainingCapacity)} unallocated
                  </span>
                )}

                <span>workday ends {fmtClock(workEnd)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="desk-today-offday">
            <div className="desk-today-offday-main">
              <span className="desk-today-capacity-label">
                Today
              </span>
              <strong>Off</strong>
            </div>

            <span>
              {fmtMins(remainingWorkMins)} carrying forward
            </span>
          </div>
        )}

        {commitments.length > 0 && (
          <div className="desk-today-commitment-section">
            <div className="desk-today-section-heading">
              <span>Commitments</span>
              <span>
                {commitments.length}{' '}
                {commitments.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="desk-today-commitment-list">
              {commitments.map((c) => (
                <div
                  key={c.id}
                  className="desk-today-commitment-item"
                  title={commitmentWindow(c)}
                >
                  <span className="desk-today-commitment-dot" />

                  <span className="desk-today-commitment-copy">
                    <strong>{c.title}</strong>
                    <span>{commitmentWindow(c)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(geoAware || showRealityCheck) && (
          <div className="desk-today-secondary-row">
            {geoAware && (
              <div className="desk-today-route-summary">
                <span className="desk-today-secondary-kicker">
                  Travel
                </span>

                {recalculatingRoute ? (
                  <span>Updating drive time…</span>
                ) : hasRoute && routeDriveMins > 0 ? (
                  <span>
                    About {fmtMins(routeDriveMins)} driving
                    {currentBaseLabel
                      ? ` · from ${
                          currentBaseLabel === 'work'
                            ? 'office'
                            : 'home'
                        }`
                      : ''}
                  </span>
                ) : hasRoute ? (
                  <span>Order set by location</span>
                ) : (
                  <span>
                    Add places to tasks to include driving.
                  </span>
                )}

                <div className="desk-today-route-actions">
                  {hasRoute && (
                    <button
                      type="button"
                      className="desk-today-inline-action"
                      onClick={onViewMap}
                    >
                      Map
                    </button>
                  )}

                  <button
                    type="button"
                    className="desk-today-inline-action"
                    onClick={onRecalcRoute}
                    disabled={recalculatingRoute}
                  >
                    Refresh
                  </button>
                </div>

                {routeError && (
                  <span className="desk-today-route-error">
                    {routeError}
                  </span>
                )}
              </div>
            )}

            {showRealityCheck && onRealityCheck && (
              <div className="desk-today-reality">
                <button
                  type="button"
                  className="btn-text"
                  onClick={onRealityCheck}
                >
                  Reality check
                </button>

                {realityCheckMessage && (
                  <span>{realityCheckMessage}</span>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="desk-today-details-toggle"
          onClick={() => setCapacityOpen((v) => !v)}
          aria-expanded={capacityOpen}
        >
          <span>
            {capacityOpen
              ? 'Hide capacity details'
              : 'View capacity details'}
          </span>

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
        </button>

        {capacityOpen && (
          <div className="desk-today-detail-panel">
            <div>
              <span>Workday</span>
              <strong>
                {fmtClock(workStart)} – {fmtClock(workEnd)}
              </strong>
            </div>

            <div>
              <span>Current time</span>
              <strong>
                {fmtMins(minutesLeftToday)} remaining
              </strong>
            </div>

            <div>
              <span>Current load</span>
              <strong>
                {fmtMins(remainingWorkMins)}
              </strong>
            </div>

            {overloaded ? (
              <div>
                <span>Capacity gap</span>
                <strong className="is-over">
                  {fmtMins(overBy)} over
                </strong>
              </div>
            ) : (
              <div>
                <span>Available buffer</span>
                <strong className="is-positive">
                  {fmtMins(remainingCapacity)}
                </strong>
              </div>
            )}
          </div>
        )}
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
                      : `On track · ${fmtMins(remainingWorkMins)} to go`}
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

