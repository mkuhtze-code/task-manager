'use client';

/**
 * Today header — calm day page, not a SaaS instrument panel.
 * Identity + one day-read + Tools. Secondary depth lives behind Tools.
 */

import { useState } from 'react';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';

export type DeskDayDepth = {
  clockRemainingMins: number;
  usableMins: number;
  fixedMins: number;
  plannedTaskMins: number;
  travelMins: number;
  fitsNow: string[];
  dayRead: string | null;
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
  dayDepth?: DeskDayDepth | null;
}) {
  const {
    overloaded,
    weekdayLabel,
    dateOnlyLabel,
    isWorkDay,
    minutesLeftToday,
    remainingWorkMins,
    workStart,
    workEnd,
    geoAware,
    recalculatingRoute,
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
    deskContext = null,
    dayDepth = null,
  } = props;

  const [toolsOpen, setToolsOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);

  const overBy = Math.max(remainingWorkMins - minutesLeftToday, 0);
  const remainingCapacity = Math.max(minutesLeftToday - remainingWorkMins, 0);
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

  const dayRead =
    depth?.dayRead ??
    (!isWorkDay
      ? 'Outside your usual work hours.'
      : overloaded
        ? 'This no longer fits today.'
        : remainingWorkMins <= 0
          ? 'Your day is clear.'
          : usable > remainingWorkMins + 30
            ? `About ${fmtMins(usable)} clear.`
            : usable < remainingWorkMins
              ? 'The afternoon is tight.'
              : 'Your day is on track.');

  const nextCommitment = deskContext?.nextCommitment;
  const dayReadWithCommitment =
    nextCommitment && !overloaded
      ? `${dayRead.replace(/\.$/, '')} · ${nextCommitment.when}.`
      : dayRead;

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

  return (
    <header
      className={[
        'today-header-card',
        'today-day-header',
        isDesktop ? 'today-day-header-desk' : 'today-day-header-mobile',
        overloaded ? 'is-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="today-day-header-row">
        <div className="today-day-identity">
          <p className="today-header-kicker">TODAY</p>
          <h1 className="today-day-title">
            {weekdayLabel} <span aria-hidden="true">·</span> {dateOnlyLabel}
          </h1>
          <p className="today-day-read">{dayReadWithCommitment}</p>
        </div>

        <div className="today-day-actions">
          {isDesktop && onDockIt ? (
            <button type="button" className="today-text-action" onClick={onDockIt}>
              Add
            </button>
          ) : null}
          <button
            type="button"
            className="today-tools-btn"
            aria-label="Tools"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((v) => !v)}
          >
            <span className="today-tools-dots" aria-hidden />
          </button>
          {!isDesktop ? <GearMenu userId={userId} /> : null}
        </div>
      </div>

      <div className="today-glance" aria-label="Day at a glance">
        <div className="today-glance-item">
          <span className="today-glance-label">Time left</span>
          <strong className="today-glance-value">{fmtMins(Math.max(minutesLeftToday, 0))}</strong>
        </div>
        <div className="today-glance-item">
          <span className="today-glance-label">Planned work</span>
          <strong className="today-glance-value">{planned > 0 ? fmtMins(planned) : 'Not timed'}</strong>
        </div>
        <div className="today-glance-item">
          <span className="today-glance-label">Commitments</span>
          <strong className="today-glance-value">{commitments.length}</strong>
        </div>
        {travel > 0 ? (
          <div className="today-glance-item">
            <span className="today-glance-label">Travel</span>
            <strong className="today-glance-value">~{fmtMins(travel)}</strong>
          </div>
        ) : null}
        {deskContext ? (
          <div className="today-glance-item">
            <span className="today-glance-label">Open tasks</span>
            <strong className="today-glance-value">{deskContext.openCount}</strong>
          </div>
        ) : null}
        {nextCommitment ? (
          <div className="today-glance-next">
            <span className="today-glance-label">Next up</span>
            <strong className="today-glance-value">{nextCommitment.title}</strong>
            <span className="today-glance-note">{nextCommitment.when}</span>
          </div>
        ) : null}
      </div>

      {toolsOpen ? (
        <div className="today-tools-panel" role="region" aria-label="Today tools">
          {showRealityCheck && onRealityCheck ? (
            <button
              type="button"
              className="today-tools-item"
              onClick={() => {
                onRealityCheck();
                setToolsOpen(false);
              }}
            >
              Reality check
              {realityCheckMessage ? (
                <span className="today-tools-quiet">{realityCheckMessage}</span>
              ) : null}
            </button>
          ) : null}

          <button
            type="button"
            className="today-tools-item"
            aria-expanded={shapeOpen}
            onClick={() => setShapeOpen((v) => !v)}
          >
            {shapeOpen ? 'Hide day shape' : 'Day shape'}
          </button>

          {shapeOpen ? (
            <div className="today-day-shape">
              {isWorkDay ? (
                <p className="today-shape-line mono">
                  {fmtClock(workStart)} – {fmtClock(workEnd)}
                  {isWorkDay
                    ? ` · ${fmtMins(Math.max(minutesLeftToday, 0))} left`
                    : ''}
                </p>
              ) : (
                <p className="today-shape-line">Outside normal work hours</p>
              )}
              <dl className="today-shape-dl">
                <div>
                  <dt>Planned</dt>
                  <dd className="mono">{planned > 0 ? fmtMins(planned) : 'None timed'}</dd>
                </div>
                {fixed > 0 ? (
                  <div>
                    <dt>Fixed</dt>
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
                  <dt>Usable</dt>
                  <dd className="mono">{fmtMins(Math.max(usable, 0))}</dd>
                </div>
                {overloaded ? (
                  <div>
                    <dt>Fit</dt>
                    <dd className="today-shape-warn">Over by {fmtMins(overBy)}</dd>
                  </div>
                ) : null}
              </dl>
              {commitments.length > 0 ? (
                <ul className="today-shape-commitments">
                  {commitments.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <span>{c.title}</span>
                      <span className="mono">{commitmentWindow(c)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {geoAware ? (
            <div className="today-tools-geo">
              <span>
                {recalculatingRoute
                  ? 'Updating route…'
                  : routeError
                    ? routeError
                    : travel > 0
                      ? `About ${fmtMins(travel)} driving`
                      : hasRoute
                        ? 'Stops ordered by place'
                        : 'No route yet'}
              </span>
              <div className="today-tools-geo-actions">
                {hasRoute ? (
                  <button type="button" className="today-text-action" onClick={onViewMap}>
                    Map
                  </button>
                ) : null}
                <button
                  type="button"
                  className="today-text-action"
                  onClick={onRecalcRoute}
                  disabled={recalculatingRoute}
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : null}

          {isDesktop ? <GearMenu userId={userId} /> : null}
        </div>
      ) : null}
    </header>
  );
}
