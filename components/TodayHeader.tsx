'use client';

import { useState } from 'react';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';
import { ChevronIcon, FitCheckIcon, FitWarnIcon } from '@/components/icons';

export type DeskDayDepth = {
  /** Clock time left until work end. */
  clockRemainingMins: number;
  /** Usable work capacity after fixed commitments (may be 0). */
  usableMins: number;
  /** Fixed pressure still overlapping the remainder (meetings/events). */
  fixedMins: number;
  /** Open timed task work still on the plate. */
  plannedTaskMins: number;
  /** Drive time in current route-aware plan (0 if not geo). */
  travelMins: number;
  /** Up to 3 task titles that define the shape of what fits next. */
  fitsNow: string[];
  /** Quiet day read — derived, not scored. */
  dayRead: string | null;
};

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
  /** Plain-language list order — only when it helps the user. */
  orderHint?: string | null;
  deskContext?: {
    mode: 'day' | 'task';
    openCount: number;
    timedCount: number;
    nextCommitment?: { title: string; when: string } | null;
    jobsWithOpen?: number;
    meetingsToday?: number;
    travelSummary?: string | null;
    sortModeLabel?: string | null;
    taskRemainingMins?: number;
    taskEstimateMins?: number;
    taskJobName?: string | null;
    taskPlace?: string | null;
    taskActive?: boolean;
    taskSubsDone?: number;
    taskSubsTotal?: number;
  } | null;
  /** Authoritative depth numbers from Today capacity math. */
  dayDepth?: DeskDayDepth | null;
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
    deskContext = null,
    dayDepth = null,
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
      `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    );
    const endLabel = fmtClock(
      `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
    );
    return `${startLabel} – ${endLabel}`;
  }


  if (isDesktop) {
    const fitChipLabel = !isWorkDay
      ? 'Off day'
      : overloaded
        ? `Over by ${fmtMins(overBy)}`
        : remainingWorkMins > 0
          ? `${fmtMins(remainingWorkMins)} on the plate`
          : 'Clear';

    const freeLabel =
      isWorkDay && !overloaded
        ? `${fmtMins(remainingCapacity)} free`
        : isWorkDay
          ? `${fmtMins(minutesLeftToday)} left`
          : null;

    const depth = dayDepth;
    const usable = depth?.usableMins ?? remainingCapacity;
    const planned = depth?.plannedTaskMins ?? Math.max(remainingWorkMins - (depth?.fixedMins ?? 0) - (depth?.travelMins ?? 0), 0);
    const fixed = depth?.fixedMins ?? 0;
    const travel = depth?.travelMins ?? (geoAware ? routeDriveMins : 0);
    const dayRead =
      depth?.dayRead ??
      (!isWorkDay
        ? 'Outside your usual working days.'
        : overloaded
          ? 'Remaining work no longer fits today.'
          : remainingWorkMins <= 0
            ? "You're clear for the rest of today."
            : usable > remainingWorkMins + 30
              ? 'You have room for another task.'
              : usable < remainingWorkMins
                ? 'Your afternoon is getting tighter.'
                : 'Your day is on track.');

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
              title="How open work sits against time left today"
            >
              <span className="desk-today-fit-chip-icon" aria-hidden="true">
                {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
              </span>
              <span className="desk-today-fit-chip-copy">
                <strong>{fitChipLabel}</strong>
                {freeLabel ? (
                  <span className="desk-today-fit-chip-meta">{freeLabel}</span>
                ) : null}
              </span>
            </div>
          </div>

          <div className="desk-today-context" aria-label="Day context">
            {deskContext?.mode === 'task' ? (
              <>
                <span className="desk-ctx-cluster desk-ctx-emphasis">
                  {deskContext.taskActive ? 'Running' : 'Selected'}
                  {typeof deskContext.taskRemainingMins === 'number' &&
                  deskContext.taskEstimateMins &&
                  deskContext.taskEstimateMins > 0 ? (
                    <strong className="mono">
                      {fmtMins(deskContext.taskRemainingMins)} left
                    </strong>
                  ) : (
                    <strong>untimed</strong>
                  )}
                </span>
                {deskContext.taskJobName ? (
                  <span className="desk-ctx-cluster" title={deskContext.taskJobName}>
                    <span className="desk-ctx-k">Job</span>
                    <strong>{deskContext.taskJobName}</strong>
                  </span>
                ) : null}
                {deskContext.taskPlace ? (
                  <span className="desk-ctx-cluster" title={deskContext.taskPlace}>
                    <span className="desk-ctx-k">Place</span>
                    <strong>{deskContext.taskPlace}</strong>
                  </span>
                ) : null}
                {typeof deskContext.taskSubsTotal === 'number' &&
                deskContext.taskSubsTotal > 0 ? (
                  <span className="desk-ctx-cluster mono">
                    {(deskContext.taskSubsDone ?? 0)}/{deskContext.taskSubsTotal} steps
                  </span>
                ) : null}
              </>
            ) : (
              <span className="desk-ctx-line">
                <span className="desk-ctx-cluster">
                  <strong className="mono">{deskContext?.openCount ?? 0}</strong> open
                  {typeof deskContext?.timedCount === 'number' &&
                  deskContext.timedCount > 0 ? (
                    <span className="desk-ctx-quiet">
                      · <strong className="mono">{deskContext.timedCount}</strong> timed
                    </span>
                  ) : null}
                </span>
                {deskContext?.nextCommitment ? (
                  <span className="desk-ctx-cluster desk-ctx-next" title={deskContext.nextCommitment.title}>
                    <span className="desk-ctx-k">Next</span>
                    <strong className="mono">{deskContext.nextCommitment.when}</strong>
                    <span className="desk-ctx-quiet">{deskContext.nextCommitment.title}</span>
                  </span>
                ) : null}
                {typeof deskContext?.jobsWithOpen === 'number' &&
                deskContext.jobsWithOpen > 0 ? (
                  <span className="desk-ctx-cluster">
                    <strong className="mono">{deskContext.jobsWithOpen}</strong>
                    <span className="desk-ctx-quiet">
                      {deskContext.jobsWithOpen === 1 ? 'job' : 'jobs'}
                    </span>
                  </span>
                ) : null}
                {deskContext?.travelSummary ? (
                  <span className="desk-ctx-cluster">{deskContext.travelSummary}</span>
                ) : null}
              </span>
            )}
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

        {capacityOpen ? (
          <div className="desk-today-depth" aria-label="Day depth">
            <p className="desk-depth-read">{dayRead}</p>

            {isWorkDay ? (
              <div className="desk-depth-day">
                <div className="desk-depth-day-head">
                  <span className="mono">{fmtClock(workStart)}</span>
                  <span className="desk-depth-day-label">Now</span>
                  <span className="mono">{fmtClock(workEnd)}</span>
                </div>
                <div className="desk-today-rail desk-depth-rail-track">
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
                <div className="desk-depth-day-foot">
                  <span>
                    <strong className="mono">{fmtMins(minutesLeftToday)}</strong>{' '}
                    remaining on the clock
                  </span>
                  <span>
                    <strong className="mono">{fmtMins(Math.max(usable, 0))}</strong>{' '}
                    usable
                  </span>
                </div>
              </div>
            ) : (
              <p className="desk-depth-off">
                Outside your normal working days
                {remainingWorkMins > 0
                  ? ` · ${fmtMins(remainingWorkMins)} still on the plate`
                  : ''}
              </p>
            )}

            <div className="desk-depth-columns">
              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Capacity</h3>
                <ul className="desk-depth-facts">
                  {planned > 0 ? (
                    <li>
                      <span>Planned work</span>
                      <strong className="mono">{fmtMins(planned)}</strong>
                    </li>
                  ) : (
                    <li>
                      <span>Planned work</span>
                      <strong>None timed</strong>
                    </li>
                  )}
                  {fixed > 0 ? (
                    <li>
                      <span>Fixed time</span>
                      <strong className="mono">{fmtMins(fixed)}</strong>
                    </li>
                  ) : null}
                  {travel > 0 ? (
                    <li>
                      <span>Travel</span>
                      <strong className="mono">~{fmtMins(travel)}</strong>
                    </li>
                  ) : null}
                  <li>
                    <span>Usable from here</span>
                    <strong className="mono">{fmtMins(Math.max(usable, 0))}</strong>
                  </li>
                </ul>
              </section>

              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Reality</h3>
                <ul className="desk-depth-facts">
                  {overloaded ? (
                    <li>
                      <span>Fit</span>
                      <strong className="desk-depth-warn">
                        Over by {fmtMins(overBy)}
                      </strong>
                    </li>
                  ) : remainingWorkMins > 0 ? (
                    <li>
                      <span>Fit</span>
                      <strong>Work fits the remainder</strong>
                    </li>
                  ) : (
                    <li>
                      <span>Fit</span>
                      <strong>Clear</strong>
                    </li>
                  )}
                  {showRealityCheck && onRealityCheck ? (
                    <li className="desk-depth-action-row">
                      <button
                        type="button"
                        className="btn-text"
                        onClick={onRealityCheck}
                      >
                        Reality check
                      </button>
                      {realityCheckMessage ? (
                        <span className="desk-ctx-quiet">{realityCheckMessage}</span>
                      ) : null}
                    </li>
                  ) : (
                    <li>
                      <span className="desk-ctx-quiet">
                        Log finishes as you go — Dokkit learns from what actually happened.
                      </span>
                    </li>
                  )}
                </ul>
              </section>

              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Context</h3>
                <ul className="desk-depth-facts">
                  {deskContext?.nextCommitment ? (
                    <li>
                      <span>Next</span>
                      <strong title={deskContext.nextCommitment.title}>
                        {deskContext.nextCommitment.when}{' '}
                        {deskContext.nextCommitment.title}
                      </strong>
                    </li>
                  ) : commitments.length > 0 ? (
                    <li>
                      <span>Fixed items</span>
                      <strong className="mono">{commitments.length}</strong>
                    </li>
                  ) : (
                    <li>
                      <span>Fixed items</span>
                      <strong>None ahead</strong>
                    </li>
                  )}
                  {typeof deskContext?.jobsWithOpen === 'number' &&
                  deskContext.jobsWithOpen > 0 ? (
                    <li>
                      <span>Jobs with open work</span>
                      <strong className="mono">{deskContext.jobsWithOpen}</strong>
                    </li>
                  ) : null}
                  {geoAware ? (
                    <li>
                      <span>Travel</span>
                      <strong>
                        {recalculatingRoute
                          ? 'Updating…'
                          : travel > 0
                            ? `~${fmtMins(travel)} estimated`
                            : hasRoute
                              ? 'Stops ordered'
                              : 'No stops yet'}
                      </strong>
                      <span className="desk-depth-inline-actions">
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
                      </span>
                      {routeError ? (
                        <span className="desk-today-route-error">{routeError}</span>
                      ) : null}
                    </li>
                  ) : null}
                </ul>
              </section>
            </div>

            {depth && depth.fitsNow.length > 0 ? (
              <div className="desk-depth-fits">
                <h3 className="desk-depth-col-title">What fits from here</h3>
                <ol className="desk-depth-fits-list">
                  {depth.fitsNow.map((title, i) => (
                    <li key={`${i}-${title}`}>
                      <span className="desk-depth-fits-step">
                        {i === 0 ? 'Now' : i === 1 ? 'Then' : 'If time'}
                      </span>
                      <span className="desk-depth-fits-title">{title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {commitments.length > 0 ? (
              <div className="desk-depth-commitments">
                <h3 className="desk-depth-col-title">Fixed time</h3>
                <div className="desk-today-commitment-list">
                  {commitments.slice(0, 5).map((c) => (
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

