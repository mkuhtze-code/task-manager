'use client';

/**
 * Today banner — a focused command surface for the shape and pace of the day.
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
  patternInsight?: {
    taskText: string;
    patternLabel: string;
    sampleCount: number;
    plannedMins: number;
    learnedMins: number;
    deltaMins: number;
  } | null;
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
    patternInsight = null,
  } = props;

  const [toolsOpen, setToolsOpen] = useState(false);
  const [depthOpen, setDepthOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

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
  const capacityTotal = Math.max(usable, planned + fixed + travel, 1);
  const plannedPct = Math.min((planned / capacityTotal) * 100, 100);
  const fixedPct = Math.min((fixed / capacityTotal) * 100, Math.max(100 - plannedPct, 0));
  const travelPct = Math.min((travel / capacityTotal) * 100, Math.max(100 - plannedPct - fixedPct, 0));
  const committedPct = Math.min(plannedPct + fixedPct + travelPct, 100);
  const freePct = Math.max(100 - committedPct, 0);

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
  const clockPct = Math.max(0, Math.min(props.nowPercent * 100, 100));
  const planPct = Math.max(0, Math.min(props.planWidthPercent * 100, 100 - clockPct));
  const workStartMinutes = (() => {
    const [h, m] = workStart.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  })();
  const workEndMinutes = (() => {
    const [h, m] = workEnd.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  })();
  const workSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const timeMarkers = commitments
    .filter((c) => !c.all_day)
    .map((c) => {
      const start = new Date(c.start_at);
      const end = new Date(c.end_at);
      const startMins = start.getHours() * 60 + start.getMinutes();
      const endMins = end.getHours() * 60 + end.getMinutes();
      const left = Math.max(0, Math.min(((startMins - workStartMinutes) / workSpan) * 100, 100));
      const right = Math.max(left, Math.min(((endMins - workStartMinutes) / workSpan) * 100, 100));
      return { ...c, left, width: Math.max(right - left, 1.2), time: fmtClock(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`) };
    })
    .filter((c) => c.left < 100 && c.left + c.width > 0)
    .slice(0, 8);
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
        headerCollapsed ? 'today-header-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <section className="today-banner-core" aria-label="Today's plan">
        <div className="today-banner-hero">
          <div className="today-banner-date">
            <span className="today-banner-overline">YOUR DAY, IN VIEW</span>
            <h1 className="today-banner-title">{weekdayLabel}<span>{dateOnlyLabel}</span></h1>
            <p className="today-banner-read">{dayReadWithCommitment}</p>
          </div>
          <div className="today-banner-side">
            <div className="today-banner-clock">
              <span className="today-banner-clock-label">TIME REMAINING</span>
              <strong>{fmtMins(Math.max(minutesLeftToday, 0))}</strong>
              <span className="today-banner-clock-caption">{isWorkDay ? `of your ${fmtClock(workStart)}–${fmtClock(workEnd)} workday` : 'outside your usual workday'}</span>
            </div>
            <div className="today-banner-actions">
              {isDesktop && onDockIt ? <button type="button" className="today-banner-add" onClick={onDockIt}>+ Add</button> : null}
              <button type="button" className="today-depth-toggle" aria-expanded={depthOpen} aria-controls="today-day-depth" onClick={() => setDepthOpen((v) => !v)}>{depthOpen ? "Hide day depth" : "Day depth"}</button>
              {isDesktop ? (
                <button type="button" className="today-tools-btn" aria-label="Tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}><span className="today-tools-dots" aria-hidden /></button>
              ) : (
                <>
                  <button type="button" className="today-map-btn" aria-label="Open map" title="Open map" onClick={() => { onViewMap(); setToolsOpen(false); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 6.5 5-2 7 2 5-2v13l-5 2-7-2-5 2z" /><path d="M8.5 4.5v13M15.5 6.5v13" /></svg>
                  </button>
                  {showRealityCheck && onRealityCheck ? (
                    <button type="button" className="today-reality-note-btn" aria-label="Reality check" title="Reality check" onClick={() => onRealityCheck()}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" /><path d="M14.5 3.8V8H19M9 13l2 2 4-4" /></svg>
                      <span>Reality check</span>
                    </button>
                  ) : null}
                </>
              )}
              {!isDesktop ? <GearMenu userId={userId} /> : null}
            </div>
          </div>
        </div>
        <div className="today-capacity-summary" aria-label="Work capacity">
          <div className="today-capacity-summary-item">
            <span>Planned work</span>
            <strong>{planned > 0 ? fmtMins(planned) : 'Not timed'}</strong>
          </div>
          <div className="today-capacity-summary-item">
            <span>Usable time</span>
            <strong>{fmtMins(Math.max(usable, 0))}</strong>
          </div>
          <p className={`today-capacity-summary-read${overloaded ? ' is-over' : ''}`}>
            {overloaded ? `Over capacity by ${fmtMins(overBy)}` : dayRead}
          </p>
        </div>
        <div className="today-timebar-wrap">
          <div className="today-timebar-topline">
            <span className="today-timebar-title">DAY TIMELINE</span>
            <span className="today-timebar-state">{overloaded ? `Over capacity by ${fmtMins(overBy)}` : `${fmtMins(Math.max(usable, 0))} usable time`}</span>
            <button type="button" className="today-timeline-toggle" aria-expanded={timelineOpen} aria-controls="today-timebar-details" onClick={() => setTimelineOpen((value) => !value)}>
              {timelineOpen ? 'Hide' : 'Timeline'}
            </button>
          </div>
          <div id="today-timebar-details" className="today-timebar-details" hidden={!timelineOpen}>
          <div className="today-timebar" role="img" aria-label={`Workday from ${fmtClock(workStart)} to ${fmtClock(workEnd)}, current time position ${Math.round(clockPct)} percent`}>
            <span className="today-timebar-elapsed" style={{ width: `${clockPct}%` }} />
            <span className="today-timebar-plan" style={{ left: `${clockPct}%`, width: `${planPct}%` }} />
            {timeMarkers.map((marker) => (
              <span key={marker.id} className={`today-timebar-event ${marker.kind === 'meeting' ? 'is-meeting' : 'is-calendar'}`} style={{ left: `${marker.left}%`, width: `${marker.width}%` }} title={`${marker.time} · ${marker.title}`} />
            ))}
            <span className="today-timebar-now" style={{ left: `${clockPct}%` }}><i /></span>
          </div>
          <div className="today-timebar-axis"><span>{fmtClock(workStart)}</span><span>NOW</span><span>{fmtClock(workEnd)}</span></div>
          {timeMarkers.length > 0 ? (
            <div className="today-timebar-events">
              {timeMarkers.slice(0, 3).map((marker) => (
                <div className="today-timebar-event-label" key={marker.id}>
                  <i className={marker.kind === 'meeting' ? 'is-meeting' : 'is-calendar'} />
                  <span>{marker.time}</span>
                  <strong>{marker.title}</strong>
                </div>
              ))}
              {timeMarkers.length > 3 ? <span className="today-timebar-more">+{timeMarkers.length - 3} more</span> : null}
            </div>
          ) : (
            <p className="today-timebar-empty">No fixed commitments on your timeline</p>
          )}
          </div>
        </div>
        <button
          type="button"
          className="today-header-collapse-toggle"
          aria-expanded={!headerCollapsed}
          aria-label={headerCollapsed ? 'Expand day header' : 'Collapse day header'}
          title={headerCollapsed ? 'Expand header' : 'Collapse header'}
          onClick={() => setHeaderCollapsed((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={headerCollapsed ? "m6 14 6-6 6 6" : "m6 10 6 6 6-6"} /></svg>
        </button>
      </section>

      <div className="today-glance" aria-label="Day at a glance">
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

      <div id="today-day-depth" className="today-day-depth-panel" hidden={!depthOpen}>
          <section className="today-day-shape" aria-label="Day depth">
            <div className="today-depth-heading">
              <div className="today-depth-heading-copy">
                <strong>What your history says</strong>
                <span>{isWorkDay ? `${fmtClock(workStart)}–${fmtClock(workEnd)} workday` : 'Outside usual work hours'}</span>
              </div>
              <button type="button" className="today-overlay-close" aria-label="Close day depth" title="Close" onClick={() => setDepthOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
              </button>
            </div>
            {patternInsight ? (
              <aside className="today-pattern-insight" aria-label="Learned work pattern">
                <div className="today-pattern-insight-top">
                  <span className="today-pattern-eyebrow">A pattern worth noticing</span>
                  <span className="today-pattern-sample">{patternInsight.sampleCount} timed examples</span>
                </div>
                <strong className="today-pattern-headline">
                  {patternInsight.deltaMins > Math.max(10, patternInsight.plannedMins * 0.15)
                    ? `Plan is short by ${fmtMins(patternInsight.deltaMins)}`
                    : patternInsight.deltaMins < -Math.max(10, patternInsight.plannedMins * 0.15)
                      ? `Plan allows ${fmtMins(Math.abs(patternInsight.deltaMins))} extra`
                      : 'Plan matches your usual pace'}
                </strong>
                <p>
                  Across {patternInsight.sampleCount} measured examples of <b>{patternInsight.patternLabel}</b>,
                  Dokkit expects about <b>{fmtMins(patternInsight.learnedMins)}</b> for “{patternInsight.taskText}”.
                  Today’s plan allows <b>{fmtMins(patternInsight.plannedMins)}</b>.
                </p>
                <div className="today-pattern-comparison" aria-label="Planned and learned duration comparison">
                  <div>
                    <span>Planned</span>
                    <div className="today-pattern-track"><i style={{ width: `${Math.min(100, (patternInsight.plannedMins / Math.max(patternInsight.plannedMins, patternInsight.learnedMins, 1)) * 100)}%` }} /></div>
                    <b>{fmtMins(patternInsight.plannedMins)}</b>
                  </div>
                  <div>
                    <span>Learned</span>
                    <div className="today-pattern-track learned"><i style={{ width: `${Math.min(100, (patternInsight.learnedMins / Math.max(patternInsight.plannedMins, patternInsight.learnedMins, 1)) * 100)}%` }} /></div>
                    <b>{fmtMins(patternInsight.learnedMins)}</b>
                  </div>
                </div>
                <span className="today-pattern-footnote">Based on repeated completed work, not a generic productivity rule.</span>
              </aside>
            ) : null}

            {!patternInsight ? (
              <div className="today-pattern-empty">
                <strong>No reliable repeat-work signal yet</strong>
                <p>As Dokkit records more completed work, this space will surface a specific pattern—not another capacity summary.</p>
              </div>
            ) : null}

            {depth?.fitsNow.length ? (
              <div className="today-depth-fits">
                <span className="today-depth-label">Good fits for the time left</span>
                <ul>
                  {depth.fitsNow.slice(0, 3).map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
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
