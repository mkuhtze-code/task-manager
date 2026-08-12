'use client';

import type { Task } from '@/lib/taskTypes';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';
import TopSwitcher from '@/components/TopSwitcher';
import { FitCheckIcon, FitWarnIcon, StopIcon } from '@/components/icons';

export function TodayHeader(props: {
  overloaded: boolean;
  weekdayLabel: string;
  dateOnlyLabel: string;
  onOpenAnalytics: () => void;
  activeTask: Task | null;
  activeOverEstimate: boolean;
  activeLiveLogged: number;
  onOpenActiveTask: () => void;
  onStopActiveTask: () => void;
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
  onViewMap: () => void;
}) {
  const {
    overloaded, weekdayLabel, dateOnlyLabel, onOpenAnalytics, activeTask, activeOverEstimate,
    activeLiveLogged, onOpenActiveTask, onStopActiveTask, isWorkDay, minutesLeftToday,
    remainingWorkMins, nowPercent, planWidthPercent, workStart, workEnd, geoAware,
    recalculatingRoute, currentBaseLabel, onRecalcRoute, routeError, hasRoute, onViewMap,
  } = props;

  return (
    <div
      className={overloaded ? 'today-header-card overloaded' : 'today-header-card'}
      onClick={onOpenAnalytics}
    >
      <div className="today-header-top-row">
        <div className="today-header-date-block">
          <div className="today-header-weekday">{weekdayLabel}</div>
          <div className="today-header-date">{dateOnlyLabel}</div>
        </div>
        <div className="today-header-top-right">
          <TopSwitcher active="today" />
          <GearMenu />
        </div>
      </div>

      {activeTask && (
        <div
          className={activeOverEstimate ? 'header-active-strip over' : 'header-active-strip'}
          onClick={(e) => { e.stopPropagation(); onOpenActiveTask(); }}
        >
          <span className="header-active-dot" />
          <span className="header-active-text">{activeTask.text}</span>
          <span className="header-active-elapsed mono">{fmtMins(activeLiveLogged)}</span>
          <button
            className="header-active-stop"
            onClick={(e) => { e.stopPropagation(); onStopActiveTask(); }}
            aria-label="Stop timer"
          >
            <StopIcon />
          </button>
        </div>
      )}

      {isWorkDay ? (
        <>
          <div className="header-compare-row">
            <div className="header-compare-stat">
              <div className="header-compare-number mono">{fmtMins(minutesLeftToday)}</div>
              <div className="header-compare-label">time left</div>
            </div>
            <div className={overloaded ? 'header-fit-icon over' : 'header-fit-icon fits'}>
              {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
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
              <div
                className={activeTask ? 'day-rail-now-dot active' : 'day-rail-now-dot'}
                style={{ left: `${nowPercent * 100}%` }}
              />
            </div>
            <div className="day-rail-labels">
              <span>{fmtClock(workStart)}</span>
              {overloaded && (
                <span className="day-rail-overflow-label">+{fmtMins(remainingWorkMins - minutesLeftToday)}</span>
              )}
              <span>{fmtClock(workEnd)}</span>
            </div>
          </div>

          {geoAware && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-text"
                  style={{ padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); onRecalcRoute(); }}
                  disabled={recalculatingRoute}
                >
                  {recalculatingRoute
                    ? 'Recalculating route…'
                    : currentBaseLabel
                      ? `Recalculate route (from ${currentBaseLabel === 'work' ? 'office' : 'home'})`
                      : 'Recalculate route'}
                </button>
                {hasRoute && (
                  <button
                    className="btn-text"
                    style={{ padding: 0 }}
                    onClick={(e) => { e.stopPropagation(); onViewMap(); }}
                  >
                    View Map
                  </button>
                )}
              </div>
              {routeError && (
                <p style={{ fontSize: 11, color: 'var(--danger-text, var(--danger))', margin: '4px 0 0' }}>
                  {routeError}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="header-off-row">
          <div className="header-compare-number mono">Off</div>
          <div className="header-compare-label">{fmtMins(remainingWorkMins)} carrying forward</div>
        </div>
      )}
    </div>
  );
}
