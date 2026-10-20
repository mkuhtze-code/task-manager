'use client';

/**
 * Task row on Today — collapsed line; expand is the first real view of the task.
 * Start / Stop and Details are primary actions, not footnotes.
 */

import { useEffect, useState } from 'react';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtClock, fmtMins } from '@/lib/timeFormat';
import {
  CheckIcon,
  ChevronIcon,
  DragHandleIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';
import ContextLine from '@/components/ContextLine';
import ObjectRow from '@/components/instrument/ObjectRow';

export function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
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
  const [subsOpen, setSubsOpen] = useState(true);

  useEffect(() => {
    if (!expanded) setSubsOpen(true);
  }, [expanded]);

  const progressPct = timed
    ? Math.min(
        (1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100,
        100
      )
    : 0;

  const showCollapsedProgress =
    timed && (running || progressPct > 0 || t.logged_mins > 0);

  const loggedDisplay = running
    ? liveLogged
    : Math.max(t.logged_mins || 0, 0);

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

  const hasFacts = !!(
    jobLabel ||
    t.location_text ||
    t.due_today ||
    fitLabel ||
    learnedHint ||
    t.intended_time
  );

  return (
    <div
      className={rowClass}
      data-experience-object="task"
      data-object-state={running ? 'active' : t.status}
      data-expanded={expanded ? 'true' : 'false'}
      title={!expanded && fitLabel ? fitLabel : undefined}
    >
      <ObjectRow state={running ? 'active' : t.status} className="task-main" part="summary">
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
          data-experience-part="identity"
          onClick={onToggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            // Context links live inside the expandable task body. Let keyboard
            // activation follow the link rather than also toggling the task.
            if ((e.target as HTMLElement).closest('a, button, input, textarea, select')) {
              return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand();
            }
          }}
          aria-expanded={expanded}
          aria-label={[t.text, expanded ? 'collapse' : 'expand', running ? 'Timer running' : null, overCap ? 'Over estimate' : null, fitLabel ? `Fit: ${fitLabel}` : null].filter(Boolean).join('. ')}
        >
          <div className="task-text" data-experience-part="title">{t.text}</div>
          {t.intended_time ? (
            <div
              className="task-card-intended-time"
              aria-label={`Scheduled for ${fmtClock(t.intended_time)}`}
            >
              <span aria-hidden="true">◷</span>
              <span>{fmtClock(t.intended_time)}</span>
            </div>
          ) : null}
          {jobLabel || t.location_text ? (
            <ContextLine
              className="task-card-context"
              items={[
                ...(jobLabel
                  ? [
                      {
                        label: jobLabel,
                        href: t.job_id ? `/jobs/${t.job_id}` : undefined,
                      },
                    ]
                  : []),
                ...(t.location_text ? [{ label: t.location_text }] : []),
              ]}
            />
          ) : null}
        </div>

        <div
          className="task-card-glance"
          data-experience-part="glance"
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
      </ObjectRow>

      {showCollapsedProgress && !expanded ? (
        <div className="task-card-progress" aria-hidden>
          <div
            className="task-card-progress-fill"
            style={{ width: `${Math.max(progressPct, running ? 4 : 0)}%` }}
          />
        </div>
      ) : null}

      {expanded ? (
        <div className="task-reveal" data-experience-part="detail">
          {timed ? (
            <div className="reveal-time">
              <div className="reveal-time-track" aria-hidden>
                <div
                  className="reveal-time-fill"
                  style={{ width: `${Math.max(progressPct, running ? 4 : 0)}%` }}
                />
              </div>
              <div className="reveal-time-copy">
                {loggedDisplay > 0 || running ? (
                  <>
                    <span>
                      <strong className="mono">{fmtMins(loggedDisplay)}</strong> logged
                    </span>
                    <span className="reveal-sep" aria-hidden>
                      ·
                    </span>
                  </>
                ) : null}
                <span>
                  <strong className="mono">{fmtMins(t.estimate_mins)}</strong> estimate
                </span>
                {remainingForThis > 0 ? (
                  <>
                    <span className="reveal-sep" aria-hidden>
                      ·
                    </span>
                    <span>~{fmtMins(remainingForThis)} left</span>
                  </>
                ) : overCap ? (
                  <>
                    <span className="reveal-sep" aria-hidden>
                      ·
                    </span>
                    <span className="reveal-over">over estimate</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasFacts ? (
            <dl className="reveal-facts">
              {jobLabel ? (
                <div>
                  <dt>Job</dt>
                  <dd>{jobLabel}</dd>
                </div>
              ) : null}
              {t.location_text ? (
                <div>
                  <dt>Place</dt>
                  <dd>{t.location_text}</dd>
                </div>
              ) : null}
              {t.intended_time ? (
                <div>
                  <dt>Scheduled</dt>
                  <dd className="mono">{fmtClock(t.intended_time)}</dd>
                </div>
              ) : null}
              {t.due_today ? (
                <div>
                  <dt>Due</dt>
                  <dd>Today</dd>
                </div>
              ) : null}
              {fitLabel ? (
                <div>
                  <dt>In the day</dt>
                  <dd title={fitReason ?? undefined}>{fitLabel}</dd>
                </div>
              ) : null}
              {learnedHint ? (
                <div>
                  <dt>Usually</dt>
                  <dd>~{learnedHint}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <TaskInfo
            value={t.info || ''}
            onSave={(info) => onSaveInfo(t.id, info)}
            surface="paper"
          />

          {subs.length > 0 ? (
            <div className="reveal-steps">
              <button
                type="button"
                className={
                  subsOpen
                    ? 'reveal-steps-head open'
                    : 'reveal-steps-head'
                }
                onClick={() => setSubsOpen((o) => !o)}
                aria-expanded={subsOpen}
              >
                <span>
                  {doneSubs} of {subs.length} steps
                </span>
                <span className="subs-head-chev mono" aria-hidden>
                  {subsOpen ? '−' : '+'}
                </span>
              </button>

              {subsOpen
                ? subs.map((s) => (
                    <div key={s.id} className="reveal-step">
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

          <div className="reveal-actions" data-experience-part="actions">
            {timed ? (
              <button
                type="button"
                className="reveal-btn-primary"
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
            ) : (
              <button
                type="button"
                className="reveal-btn-primary"
                onPointerDown={stopPointer}
                onPointerUp={stopPointer}
                onClick={isolate(() => onComplete(t.id))}
              >
                <span>Done</span>
              </button>
            )}

            {timed ? (
              <button
                type="button"
                className="reveal-btn-secondary"
                onPointerDown={stopPointer}
                onPointerUp={stopPointer}
                onClick={isolate(() => onComplete(t.id))}
              >
                Done
              </button>
            ) : null}

            <button
              type="button"
              className="reveal-btn-more"
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
