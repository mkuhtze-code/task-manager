'use client';

import { useState } from 'react';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import GearMenu from '@/components/GearMenu';
import TopSwitcher from '@/components/TopSwitcher';
import { ChevronIcon, FitCheckIcon, FitWarnIcon } from '@/components/icons';
import type { Surface } from '@/lib/thinking/types';

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
  onViewMap: () => void;
  onNavigate?: (surface: Surface) => void;
}) {
  const {
    overloaded, weekdayLabel, dateOnlyLabel, isWorkDay, minutesLeftToday,
    remainingWorkMins, nowPercent, planWidthPercent, workStart, workEnd, geoAware,
    recalculatingRoute, currentBaseLabel, onRecalcRoute, routeError, hasRoute, onViewMap,
    onNavigate,
  } = props;

  const [capacityOpen, setCapacityOpen] = useState(false);

  const overBy = remainingWorkMins - minutesLeftToday;

  return (
    <div className={overloaded ? 'today-header-card overloaded' : 'today-header-card'}>
      <div className="today-header-top-row">
        <div className="today-header-date-block">
          <div className="today-header-weekday">{weekdayLabel}</div>
          <div className="today-header-date">{dateOnlyLabel}</div>
        </div>
        <div className="today-header-top-right">
          <TopSwitcher active="today" onNavigate={onNavigate} />
          <GearMenu />
        </div>
      </div>

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
            </div>
          )}
        </div>
      ) : (
        <div className="header-off-row">
          <div className="header-compare-number mono">Off</div>
          <div className="header-compare-label">{fmtMins(remainingWorkMins)} carrying forward</div>
        </div>
      )}
    </div>
  );
}
