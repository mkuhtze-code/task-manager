'use client';

import { useState, type ReactNode } from 'react';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';
import { ChevronIcon, FitCheckIcon, FitWarnIcon } from '@/components/icons';
import ContextLine from '@/components/ContextLine';

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
  /** Fixed blocks on the workday rail (0–1 of work window). */
  commitmentMarkers?: Array<{
    startPct: number;
    endPct: number;
    label: string;
  }>;
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
    href?: string;
    kind?: 'meeting' | 'calendar';
    jobLabel?: string | null;
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
    const depth = dayDepth;
    const usable = depth?.usableMins ?? remainingCapacity;
    const planned =
      depth?.plannedTaskMins ??
      Math.max(
        remainingWorkMins - (depth?.fixedMins ?? 0) - (depth?.travelMins ?? 0),
        0
      );
    const fixed = depth?.fixedMins ?? 0;
    const travel = depth?.travelMins ?? (geoAware ? routeDriveMins : 0);
    const markers = depth?.commitmentMarkers ?? [];

    const fitTitle = !isWorkDay
      ? 'Off day'
      : overloaded
        ? 'Does not fit'
        : remainingWorkMins > 0
          ? 'Fits today'
          : 'Clear';

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

    const contextBits: ReactNode[] = [];
    if (deskContext?.mode === 'task') {
      contextBits.push(
        <span key="sel" className="desk-ctx-bit desk-ctx-bit-strong">
          {deskContext.taskActive ? 'Running' : 'Selected'}
          {typeof deskContext.taskRemainingMins === 'number' &&
          deskContext.taskEstimateMins &&
          deskContext.taskEstimateMins > 0
            ? ` · ${fmtMins(deskContext.taskRemainingMins)} left`
            : ' · untimed'}
        </span>
      );
      if (deskContext.taskJobName) {
        contextBits.push(
          <span key="job" className="desk-ctx-bit" title={deskContext.taskJobName}>
            {deskContext.taskJobName}
          </span>
        );
      }
      if (deskContext.taskPlace) {
        contextBits.push(
          <span key="place" className="desk-ctx-bit" title={deskContext.taskPlace}>
            {deskContext.taskPlace}
          </span>
        );
      }
    } else {
      const open = deskContext?.openCount ?? 0;
      const timed = deskContext?.timedCount ?? 0;
      contextBits.push(
        <span key="open" className="desk-ctx-bit">
          <strong className="mono">{open}</strong> open
          {timed > 0 ? (
            <>
              {' '}
              · <strong className="mono">{timed}</strong> timed
            </>
          ) : null}
        </span>
      );
      if (deskContext?.nextCommitment) {
        contextBits.push(
          <span
            key="next"
            className="desk-ctx-bit"
            title={deskContext.nextCommitment.title}
          >
            Next <strong className="mono">{deskContext.nextCommitment.when}</strong>{' '}
            {deskContext.nextCommitment.title}
          </span>
        );
      }
      if ((deskContext?.jobsWithOpen ?? 0) > 0) {
        contextBits.push(
          <span key="jobs" className="desk-ctx-bit">
            <strong className="mono">{deskContext!.jobsWithOpen}</strong>{' '}
            {deskContext!.jobsWithOpen === 1 ? 'job' : 'jobs'}
          </span>
        );
      }
      if (deskContext?.travelSummary) {
        contextBits.push(
          <span key="travel" className="desk-ctx-bit">
            {deskContext.travelSummary}
          </span>
        );
      }
    }

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
          <div className="desk-today-orient">
            <div className="desk-today-identity">
              <span className="desk-today-kicker">Day</span>
              <h1 className="desk-today-title">Today</h1>
              <span className="desk-today-date">{weekdayLabel} · {dateOnlyLabel}</span>
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
              <div className="desk-today-fit-body">
                <strong className="desk-today-fit-title">{fitTitle}</strong>
                {isWorkDay ? (
                  <span className="desk-today-fit-metrics mono">
                    {planned > 0 ? (
                      <span>{fmtMins(planned)} planned</span>
                    ) : (
                      <span>Nothing timed</span>
                    )}
                    <span className="desk-today-fit-sep" aria-hidden>
                      ·
                    </span>
                    <span>{fmtMins(Math.max(usable, 0))} usable</span>
                    {overloaded ? (
                      <>
                        <span className="desk-today-fit-sep" aria-hidden>
                          ·
                        </span>
                        <span className="is-over-text">
                          over by {fmtMins(overBy)}
                        </span>
                      </>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="desk-today-context" aria-label="Day context">
            {contextBits.map((bit, i) => (
              <span key={i} className="desk-ctx-wrap">
                {i > 0 ? (
                  <span className="desk-ctx-dot" aria-hidden>
                    ·
                  </span>
                ) : null}
                {bit}
              </span>
            ))}
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

        <div className="desk-today-instrument" aria-label="Today instrument">
          <div className="desk-today-now">
            <span className="desk-today-now-kicker">Now</span>
            <strong className="desk-today-now-value">{isWorkDay ? fmtMins(Math.max(minutesLeftToday, 0)) : '—'}</strong>
            <span className="desk-today-now-label">{isWorkDay ? 'working time left' : 'outside working day'}</span>
          </div>
          <div className="desk-today-capacity">
            <div className="desk-today-capacity-head"><span>Capacity</span><strong className={overloaded ? 'is-over-text' : undefined}>{overloaded ? ('Over by ' + fmtMins(overBy)) : (fmtMins(Math.max(usable, 0)) + ' usable')}</strong></div>
            <div className="desk-today-capacity-track" aria-hidden="true"><span className={overloaded ? 'is-over' : ''} style={{ width: Math.min(100, Math.max(0, planned > 0 && usable > 0 ? (planned / usable) * 100 : 0)) + '%' }} /></div>
            <div className="desk-today-capacity-meta mono"><span>{fmtMins(planned)} planned</span>{fixed > 0 ? <span>{fmtMins(fixed)} fixed</span> : null}{travel > 0 ? <span>~{fmtMins(travel)} travel</span> : null}</div>
          </div>
          <div className="desk-today-next">
            <span className="desk-today-next-kicker">Next</span>
            <strong>{dayDepth?.fitsNow?.[0] ?? deskContext?.nextCommitment?.title ?? 'Your next move'}</strong>
            <span>{deskContext?.nextCommitment ? deskContext.nextCommitment.when : overloaded ? 'Needs reshaping' : dayRead}</span>
          </div>
        </div>
        <div className="desk-today-rail" aria-label="Today's shape">
          <div className="desk-today-rail-head">
            <span className="desk-today-rail-label">Today's shape</span>
            <span className="mono">{fmtClock(workStart)} — {fmtClock(workEnd)}</span>
          </div>
          <div className="desk-today-rail-track" role="img" aria-label="Current workday shape">
            <div className="desk-today-rail-elapsed" style={{ width: `${nowPercent * 100}%` }} />
            <div
              className={['desk-today-rail-load', overloaded ? 'is-over' : ''].join(' ')}
              style={{
                left: `${nowPercent * 100}%`,
                width: `${planWidthPercent * 100}%`,
              }}
            />
            {markers.map((m, i) => (
              <div
                key={`rail-${m.label}-${i}`}
                className="desk-today-rail-fixed"
                title={m.label}
                style={{
                  left: `${m.startPct * 100}%`,
                  width: `${Math.max((m.endPct - m.startPct) * 100, 0.8)}%`,
                }}
              />
            ))}
            <div className="desk-today-rail-now" style={{ left: `${nowPercent * 100}%` }} />
          </div>
          <div className="desk-today-rail-foot">
            <span>{isWorkDay ? `${fmtMins(minutesLeftToday)} left` : 'Off day'}</span>
            <strong>{overloaded ? `Over by ${fmtMins(overBy)}` : dayRead}</strong>
            <span>{isWorkDay ? `${fmtMins(Math.max(usable, 0))} usable` : `${fmtMins(remainingWorkMins)} carrying`}</span>
          </div>
        </div>

        {capacityOpen ? (
          <div className="desk-today-depth" aria-label="Day depth">
            <p className="desk-depth-read">{dayRead}</p>

            {isWorkDay ? (
              <div className="desk-depth-day">
                <div className="desk-depth-day-head">
                  <span className="mono">{fmtClock(workStart)}</span>
                  <span className="desk-depth-day-mid">
                    <span className="desk-depth-now-label">Now</span>
                    <span className="mono">
                      {fmtMins(minutesLeftToday)} left ·{' '}
                      {fmtMins(Math.max(usable, 0))} usable
                    </span>
                  </span>
                  <span className="mono">{fmtClock(workEnd)}</span>
                </div>
                <div className="desk-depth-track" role="img" aria-label="Workday progress">
                  <div
                    className="desk-depth-track-elapsed"
                    style={{ width: `${nowPercent * 100}%` }}
                  />
                  <div
                    className={[
                      'desk-depth-track-load',
                      overloaded ? 'is-over' : '',
                    ].join(' ')}
                    style={{
                      left: `${nowPercent * 100}%`,
                      width: `${planWidthPercent * 100}%`,
                    }}
                  />
                  {markers.map((m, i) => (
                    <div
                      key={`${m.label}-${i}`}
                      className="desk-depth-track-fixed"
                      title={m.label}
                      style={{
                        left: `${m.startPct * 100}%`,
                        width: `${Math.max((m.endPct - m.startPct) * 100, 0.8)}%`,
                      }}
                    />
                  ))}
                  <div
                    className="desk-depth-track-now"
                    style={{ left: `${nowPercent * 100}%` }}
                  />
                </div>
                {markers.length > 0 ? (
                  <div className="desk-depth-marker-legend">
                    {markers.slice(0, 4).map((m, i) => (
                      <span key={`${m.label}-lg-${i}`} className="desk-depth-marker-item">
                        <span className="desk-depth-marker-swatch" aria-hidden />
                        {m.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="desk-depth-off">
                Outside your normal working days
                {remainingWorkMins > 0
                  ? ` · ${fmtMins(remainingWorkMins)} still on the plate`
                  : ''}
              </p>
            )}

            <div className="desk-depth-band">
              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Capacity</h3>
                <dl className="desk-depth-dl">
                  <div>
                    <dt>Planned work</dt>
                    <dd className="mono">
                      {planned > 0 ? fmtMins(planned) : 'None timed'}
                    </dd>
                  </div>
                  {fixed > 0 ? (
                    <div>
                      <dt>Fixed time</dt>
                      <dd className="mono">{fmtMins(fixed)}</dd>
                    </div>
                  ) : null}
                  {travel > 0 ? (
                    <div>
                      <dt>Travel</dt>
                      <dd className="mono">~{fmtMins(travel)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Usable from here</dt>
                    <dd className="mono">{fmtMins(Math.max(usable, 0))}</dd>
                  </div>
                </dl>
              </section>

              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Reality</h3>
                <dl className="desk-depth-dl">
                  <div>
                    <dt>Fit</dt>
                    <dd className={overloaded ? 'desk-depth-warn' : undefined}>
                      {overloaded
                        ? `Over by ${fmtMins(overBy)}`
                        : remainingWorkMins > 0
                          ? 'Work fits the remainder'
                          : 'Clear'}
                    </dd>
                  </div>
                  {showRealityCheck && onRealityCheck ? (
                    <div className="desk-depth-action-row">
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
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="desk-depth-col">
                <h3 className="desk-depth-col-title">Context</h3>
                <dl className="desk-depth-dl">
                  {deskContext?.nextCommitment ? (
                    <div>
                      <dt>Next</dt>
                      <dd title={deskContext.nextCommitment.title}>
                        {deskContext.nextCommitment.when}{' '}
                        {deskContext.nextCommitment.title}
                      </dd>
                    </div>
                  ) : commitments.length > 0 ? (
                    <div>
                      <dt>Fixed items</dt>
                      <dd className="mono">{commitments.length}</dd>
                    </div>
                  ) : (
                    <div>
                      <dt>Fixed items</dt>
                      <dd>None ahead</dd>
                    </div>
                  )}
                  {(deskContext?.jobsWithOpen ?? 0) > 0 ? (
                    <div>
                      <dt>Jobs with open work</dt>
                      <dd className="mono">{deskContext!.jobsWithOpen}</dd>
                    </div>
                  ) : null}
                  {geoAware ? (
                    <div>
                      <dt>Travel</dt>
                      <dd>
                        {recalculatingRoute
                          ? 'Updating…'
                          : travel > 0
                            ? `~${fmtMins(travel)} estimated`
                            : hasRoute
                              ? 'Stops ordered'
                              : 'No stops yet'}
                      </dd>
                      <div className="desk-depth-inline-actions">
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
                      {routeError ? (
                        <span className="desk-today-route-error">{routeError}</span>
                      ) : null}
                    </div>
                  ) : null}
                </dl>
              </section>
            </div>

            {depth && depth.fitsNow.length > 0 ? (
              <div className="desk-depth-fits">
                <h3 className="desk-depth-col-title">What fits from here</h3>
                <ol className="desk-depth-fits-flow">
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
                      {c.kind === 'meeting' ? (
                        <ContextLine
                          className="desk-today-commitment-context"
                          items={[
                            { label: 'Meeting', href: c.href },
                            ...(c.jobLabel ? [{ label: c.jobLabel }] : []),
                          ]}
                        />
                      ) : null}
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
      <div className={[
        'mobile-today-cockpit',
        overloaded ? 'is-over' : '',
        !isWorkDay ? 'is-off' : '',
      ].filter(Boolean).join(' ')} aria-label="Today cockpit">
        <div className="mobile-today-cockpit-top">
          <div className="mobile-today-cockpit-brand">
            <span className="mobile-today-cockpit-kicker">Today</span>
            <span className="mobile-today-cockpit-date">{weekdayLabel} · {dateOnlyLabel}</span>
          </div>
          <div className="mobile-today-cockpit-actions">
            <GearMenu userId={userId} />
            {onDockIt ? (
              <button type="button" className="mobile-today-dock" onClick={(e) => { e.stopPropagation(); onDockIt(); }}>
                <span aria-hidden="true">+</span> Dock it
              </button>
            ) : null}
          </div>
        </div>

        <div className="mobile-today-cockpit-readout">
          <div className="mobile-today-cockpit-time">
            <strong className="mono">{isWorkDay ? fmtMins(Math.max(minutesLeftToday, 0)) : '—'}</strong>
            <span>{isWorkDay ? 'working time left' : 'outside working day'}</span>
          </div>
          <div className="mobile-today-cockpit-fit">
            <span className={overloaded ? 'mobile-today-fit-dot over' : 'mobile-today-fit-dot'} aria-hidden="true" />
            <strong>{!isWorkDay ? 'OFF DAY' : overloaded ? 'DOES NOT FIT' : remainingWorkMins > 0 ? 'FITS' : 'CLEAR'}</strong>
            <span>{overloaded ? (overBy ? fmtMins(overBy) : '0m') + ' over' : fmtMins(remainingCapacity) + ' buffer'}</span>
          </div>
        </div>

        {isWorkDay ? (
          <div className="mobile-today-capacity" aria-label="Remaining capacity">
            <div className="mobile-today-capacity-head">
              <span>TIME SHAPE</span>
              <span className="mono">{fmtMins(remainingWorkMins)} on plate</span>
            </div>
            <div className="mobile-today-capacity-track" aria-hidden="true">
              <span
                className={overloaded ? 'is-over' : ''}
                style={{ width: (Math.min(100, Math.max(0, minutesLeftToday > 0 ? (remainingWorkMins / minutesLeftToday) * 100 : 0))) + '%' }}
              />
              <i style={{ left: (Math.min(100, Math.max(0, nowPercent * 100))) + '%' }} />
            </div>
            <div className="mobile-today-capacity-foot">
              <span>{fmtClock(workStart)}</span>
              <strong>{overloaded ? '+' + fmtMins(overBy) + ' to reshape' : fmtMins(remainingCapacity) + ' spare'}</strong>
              <span>{fmtClock(workEnd)}</span>
            </div>
          </div>
        ) : null}

        {deskContext?.nextCommitment ? (
          <div className="mobile-today-next">
            <span className="mobile-today-next-kicker">NEXT FIXED TIME</span>
            <strong>{deskContext.nextCommitment.title}</strong>
            <span>{deskContext.nextCommitment.when}</span>
          </div>
        ) : commitments.length > 0 ? (
          <div className="mobile-today-next">
            <span className="mobile-today-next-kicker">FIXED TIME AHEAD</span>
            <strong>{commitments[0].title}</strong>
            <span>{commitmentWindow(commitments[0])}</span>
          </div>
        ) : null}
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
              {c.kind === 'meeting' ? (
                <ContextLine
                  className="today-commitment-context"
                  items={[
                    { label: 'Meeting', href: c.href },
                    ...(c.jobLabel ? [{ label: c.jobLabel }] : []),
                  ]}
                />
              ) : null}
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

