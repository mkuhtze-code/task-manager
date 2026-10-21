'use client';

import type { ReactNode } from 'react';
import { fmtMins } from '@/lib/timeFormat';

export type TodayInstrumentProps = {
  weekdayLabel: string;
  dateOnlyLabel: string;
  isWorkDay: boolean;
  minutesLeftToday: number;
  remainingWorkMins: number;
  overloaded: boolean;
  fixedLoadMins?: number | null;
  nowPercent?: number;
  planWidthPercent?: number;
  onCapture: () => void;
  regimeLabel?: string | null;
  regimeHref?: string | null;
  regimeName?: string | null;
  secondary?: ReactNode;
};

/** Today-only first-paint instrument. All capacity values are supplied by Today selectors. */
export function TodayInstrument({
  weekdayLabel, dateOnlyLabel, isWorkDay, minutesLeftToday, remainingWorkMins,
  overloaded, fixedLoadMins, nowPercent = 0, planWidthPercent = 0, onCapture, regimeLabel, regimeHref, regimeName, secondary,
}: TodayInstrumentProps) {
  const summary = overloaded
    ? 'More work than time'
    : !isWorkDay
      ? 'Outside work hours'
      : remainingWorkMins <= 0
        ? 'Day clear'
        : fmtMins(minutesLeftToday) + ' left';

  return (
    <section className="ins-today-instrument" aria-label="Today instrument" data-testid="today-instrument">
      <div className="ins-today-instrument__identity">
        <div>
          <p className="ins-today-instrument__eyebrow">{weekdayLabel}</p>
          <h1>{dateOnlyLabel}</h1>
        </div>
        <p className="ins-today-instrument__capacity" aria-live="polite">
          <strong>{summary}</strong>
          <span>{overloaded ? 'Work exceeds time available' : fmtMins(remainingWorkMins) + ' planned'}</span>
          {typeof fixedLoadMins === 'number' ? <span>Fixed {fmtMins(fixedLoadMins)}</span> : null}
        </p>
      </div>
      <div className="ins-today-instrument__track" role="img" aria-label="Elapsed day and planned work">
        <span className="ins-today-instrument__track-elapsed" style={{ width: Math.max(0, Math.min(nowPercent * 100, 100)) + '%' }} />
        <span className="ins-today-instrument__track-planned" style={{ left: Math.max(0, Math.min(nowPercent * 100, 100)) + '%', width: Math.max(0, Math.min(planWidthPercent * 100, 100)) + '%' }} />
      </div>
      <div className="ins-today-instrument__primary">
        <button type="button" onClick={onCapture} className="ins-today-instrument__capture" data-testid="today-capture-primary">
          <span aria-hidden="true">＋</span> Capture
        </button>
      </div>
      {regimeLabel && regimeHref ? (
        <p className="ins-today-instrument__regime" role="status" data-testid="today-regime">
          <span>{regimeLabel}</span>
          <a href={regimeHref} aria-label={'Open trip: ' + (regimeName || 'Trip')}>{regimeName || 'Open trip'} <span aria-hidden="true">→</span></a>
        </p>
      ) : null}
      {secondary ? <div className="ins-today-instrument__secondary">{secondary}</div> : null}
    </section>
  );
}
