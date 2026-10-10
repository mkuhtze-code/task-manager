'use client';

/**
 * Task row on Today — collapsed instrument line, expand for secondary truth.
 * Complete / start / details only; route preference lives in Details.
 */

import { useEffect, useState } from 'react';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import {
  CheckIcon,
  ChevronIcon,
  DragHandleIcon,
  MapPinIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';
import ContextLine from '@/components/ContextLine';

export function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
  /** Live day fit label from LiveDayPlan (optional). */
  fitLabel?: string | null;
  fitReason?: string | null;
  anyActive: boolean;
  subs: Subtask[];
  learnedHint: string | null;
  jobLabel?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleSubtaskDone: (
    subtaskId: string,
    taskId: string,
    current: boolean
  ) => void;
  onSaveInfo: (id: string, info: string) => void;
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
  /** Kept for call-site compatibility; route intent is edited in Details only. */
  geoAware?: boolean;
  onRoute?: boolean;
  onSetRouteIntent?: (id: string, requiresVisit: boolean | null) => void;
}) {
  const {
    task: t,
    remainingForThis,
    liveLogged,
    overCap,
    fitLabel = null,
    fitReason = null,
    anyActive,
    subs,
    learnedHint,
    expanded,
    onToggleExpand,
    onOpenDetails,
    onComplete,
    onStart,
    onStop,
    onToggleSubtaskDone,
    onSaveInfo,
    dragHandleProps,
    jobLabel,
  } = props;

  const timed = t.estimate_mins > 0;
  const isListItem = !timed;
  const active = t.status === 'active';
  const running = timed && active;
  const startDisabled = anyActive && t.status !== 'active';

  const taskColorClass = overCap
    ? 'task-overtime'
    : t.due_today
      ? 'task-due-today'
      : '';

  const fitClass =
    fitLabel === 'Protected'
      ? 'fit-protect'
      : fitLabel === 'Fits well' || fitLabel === 'Fits'
        ? 'fit-ok'
        : fitLabel === 'Likely later' || fitLabel === 'Can move'
          ? 'fit-later'
          : fitLabel === 'Uncertain' || fitLabel === 'Not enough evidence'
            ? 'fit-uncertain'
            : fitLabel === 'Blocked'
              ? 'fit-blocked'
              : '';

  const rowClass = [
    'task-card surface-object',
    t.source === 'came_up' ? 'came-up' : '',
    taskColorClass,
    fitClass,
    isListItem ? 'task-list-item' : '',
    expanded ? 'expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const doneSubs = subs.filter((s) => s.done).length;
  const [subsOpen, setSubsOpen] = useState(false);

  useEffect(() => {
    if (!expanded) setSubsOpen(false);
  }, [expanded]);

  const progressPct = timed
    ? Math.min(
        (1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100,
        100
      )
    : 0;

  const showCollapsedProgress = timed && (running || progressPct > 0 || t.logged_mins > 0);

  let glanceRight: string | null = null;
  let glanceKind: 'elapsed' | 'time' | 'subs' | null = null;

  if (running) {
    glanceRight = fmtMins(liveLogged);
    glanceKind = 'elapsed';
  } else if (timed) {
    glanceRight = fmtMins(remainingForThis);
    glanceKind = 'time';
  } else if (subs.length > 0) {
    glanceRight = `${doneSubs}/${subs.length}`;
    glanceKind = 'subs';
  }

  function isolate(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
    };
  }

  function stopPointer(e: React.PointerEvent) {
    e.stopPropagation();
  }

  const hasMeta = !!(t.due_today || t.location_text || learnedHint || fitLabel);

  return (
    <div className={rowClass}>
      <div className="task-main">
        <button
          type="button"
          className="check-btn"
          onPointerDown={stopPointer}
          onPointerUp={stopPointer}
          onClick={isolate(() => onComplete(t.id))}
          aria-label={`Complete ${t.text}`}
        >
          <CheckIcon done={false} />
        </button>

        <div
          className="task-body"
          onClick={onToggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand();
            }
          }}
          aria-expanded={expanded}
          aria-label={`${t.text} — ${expanded ? 'collapse' : 'expand'}`}
        >
          <div className="task-text">{t.text}</div>
          {t.intended_time ? (
            <div className="task-card-intended-time" aria-label={`Scheduled for ${fmtClock(t.intended_time)}`}>
              <span aria-hidden="true">◷</span>
              <span>{fmtClock(t.intended_time)}</span>
            </div>
          ) : null}
          {jobLabel || t.location_text ? (
            <ContextLine
              className="task-card-context"
              items={[
                ...(jobLabel
                  ? [{ label: jobLabel, href: t.job_id ? `/jobs/${t.job_id}` : undefined }]
                  : []),
                ...(t.location_text ? [{ label: t.location_text }] : []),
              ]}
            />
          ) : null}
          {fitLabel ? (
            <div className="task-fit-line" title={fitReason ?? undefined}>
              <span className="task-fit-badge">{fitLabel}</span>
            </div>
          ) : null}
        </div>

        <div
          className="task-card-glance"
          onClick={onToggleExpand}
          role="presentation"
        >
          {running ? <span className="task-card-active-dot" aria-hidden /> : null}
          {glanceRight ? (
            <span
              className={
                glanceKind === 'elapsed'
                  ? 'task-card-elapsed mono'
                  : 'task-card-time mono'
              }
              title={
                glanceKind === 'elapsed'
                  ? 'Elapsed'
                  : glanceKind === 'time'
                    ? 'Remaining'
                    : 'Sub-tasks'
              }
            >
              {glanceRight}
            </span>
          ) : null}
          <span
            className={expanded ? 'task-card-chevron open' : 'task-card-chevron'}
            aria-hidden
          >
            <ChevronIcon size={14} />
          </span>
        </div>

        {dragHandleProps ? (
          <button
            type="button"
            className="drag-handle-btn"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragHandleProps.onPointerDown(e);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              dragHandleProps.onPointerMove(e);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              dragHandleProps.onPointerUp(e);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              dragHandleProps.onPointerUp(e);
            }}
            aria-label="Drag to reorder"
          >
            <DragHandleIcon />
          </button>
        ) : null}
      </div>

      {/* Collapsed progress — always visible for timed work with progress */}
      {showCollapsedProgress && !expanded ? (
        <div className="task-card-progress" aria-hidden>
          <div
            className="task-card-progress-fill"
            style={{ width: `${Math.max(progressPct, running ? 4 : 0)}%` }}
          />
        </div>
      ) : null}

      {expanded ? (
        <div className="task-reveal">
          {timed ? (
            <div className="task-progress-row" aria-hidden>
              <div className="task-progress-track">
                <div
                  className="task-progress-fill"
                  style={{ width: `${Math.max(progressPct, 0)}%` }}
                />
              </div>
            </div>
          ) : null}

          {hasMeta ? (
            <div className="task-reveal-meta">
              {t.due_today ? (
                <span className="task-reveal-line due">Due today</span>
              ) : null}
              {fitLabel ? (
                <span className="task-fit-badge" title={fitReason ?? undefined}>
                  {fitLabel}
                </span>
              ) : null}
              {learnedHint ? (
                <span className="task-reveal-line">Usually ~{learnedHint}</span>
              ) : null}
              {t.location_text ? (
                <span className="task-reveal-line location" title={t.location_text}>
                  <MapPinIcon size={13} />
                  <span className="task-reveal-location-text">{t.location_text}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          <TaskInfo
            value={t.info || ''}
            onSave={(info) => onSaveInfo(t.id, info)}
            surface="paper"
          />

          {subs.length > 0 ? (
            <div className="task-reveal-subtasks">
              <button
                type="button"
                className={
                  subsOpen
                    ? 'task-reveal-subtasks-head open'
                    : 'task-reveal-subtasks-head'
                }
                onClick={() => setSubsOpen((o) => !o)}
                aria-expanded={subsOpen}
                aria-label="Toggle sub-tasks"
              >
                <span>
                  {doneSubs}/{subs.length} steps
                </span>
                <span className="subs-head-chev mono" aria-hidden>
                  {subsOpen ? '−' : '+'}
                </span>
              </button>

              {subsOpen
                ? subs.map((s) => (
                    <div key={s.id} className="task-reveal-subtask">
                      <button
                        type="button"
                        className={s.done ? 'subtask-check done' : 'subtask-check'}
                        onPointerDown={stopPointer}
                        onPointerUp={stopPointer}
                        onClick={isolate(() =>
                          onToggleSubtaskDone(s.id, t.id, s.done)
                        )}
                        aria-label={
                          s.done ? `Undo ${s.text}` : `Complete ${s.text}`
                        }
                      />
                      <span className={s.done ? 'subtask-text done' : 'subtask-text'}>
                        {s.text}
                      </span>
                    </div>
                  ))
                : null}
            </div>
          ) : null}

          <div className="task-actions">
            {timed ? (
              <button
                type="button"
                className="task-action-link"
                disabled={!active && startDisabled}
                onPointerDown={stopPointer}
                onPointerUp={stopPointer}
                onClick={isolate(() => {
                  if (active) onStop(t.id);
                  else if (!startDisabled) onStart(t.id);
                })}
                aria-label={active ? 'Stop timer' : 'Start timer'}
              >
                {active ? <StopIcon /> : <PlayIcon />}
                <span>{active ? 'Stop' : 'Start'}</span>
              </button>
            ) : null}

            <button
              type="button"
              className="task-action-link task-action-details"
              onPointerDown={stopPointer}
              onPointerUp={stopPointer}
              onClick={isolate(onOpenDetails)}
            >
              Details
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
