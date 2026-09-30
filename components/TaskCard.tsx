'use client';

import { useEffect, useRef, useState } from 'react';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtMins } from '@/lib/timeFormat';
import {
  CheckIcon,
  ChevronIcon,
  DragHandleIcon,
  MapPinIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';
import { TaskInfo } from '@/components/TaskInfo';

export function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
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
    geoAware = false,
    onRoute = false,
    onSetRouteIntent,
  } = props;

  const timed = t.estimate_mins > 0;
  const isListItem = !timed;
  const active = t.status === 'active';
  const running = timed && active;
  const startDisabled = anyActive && t.status !== 'active';

  let taskColorClass = '';

  if (overCap) {
    taskColorClass = 'task-overtime';
  } else if (t.due_today) {
    taskColorClass = 'task-due-today';
  }

  const rowClass = [
    'task-card',
    t.source === 'came_up' ? 'came-up' : '',
    taskColorClass,
    isListItem ? 'task-list-item' : '',
    expanded ? 'expanded' : '',
  ]
    .join(' ')
    .trim();

  const doneSubs = subs.filter((s) => s.done).length;

  const [subsOpen, setSubsOpen] = useState(false);
  const [travelOpen, setTravelOpen] = useState(false);
  const travelWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) {
      setSubsOpen(false);
      setTravelOpen(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (!travelOpen) return;
    function onDoc(e: MouseEvent) {
      const el = travelWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setTravelOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [travelOpen]);

  const travelLabel =
    t.requires_visit === true
      ? 'On route'
      : t.requires_visit === false
        ? 'Not travel'
        : onRoute
          ? 'On route'
          : 'Auto';

  const progressPct = timed
    ? Math.min(
        (1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100,
        100
      )
    : 0;

  const showProgress = timed && (running || progressPct > 0);

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

  const stopPointer = (e: React.PointerEvent) =>
    e.stopPropagation();

  return (
    <div className={rowClass}>
      <div className="task-main">
        <button
          className="check-btn"
          onPointerDown={stopPointer}
          onPointerUp={stopPointer}
          onClick={isolate(() => onComplete(t.id))}
          aria-label="Complete task"
        >
          <CheckIcon done={false} />
        </button>

        <div
          className="task-body"
          onClick={onToggleExpand}
          role="button"
          aria-expanded={expanded}
          aria-label={`${t.text} — ${
            expanded ? 'collapse' : 'expand'
          }`}
        >
          <div className="task-text">
            {t.text}
          </div>

          {jobLabel && (
            <div className="task-card-job">
              <span className="task-card-job-kicker">
                Job
              </span>

              <span className="task-card-job-name">
                {jobLabel}
              </span>
            </div>
          )}
        </div>

        <div
          className="task-card-glance"
          onClick={onToggleExpand}
        >
          {running && (
            <span className="task-card-active-dot" />
          )}

          {glanceRight && (
            <span
              className={
                glanceKind === 'elapsed'
                  ? 'task-card-elapsed mono'
                  : 'task-card-time mono'
              }
            >
              {glanceRight}
            </span>
          )}

          <span
            className={
              expanded
                ? 'task-card-chevron open'
                : 'task-card-chevron'
            }
            aria-hidden="true"
          >
            <ChevronIcon size={14} />
          </span>
        </div>

        {dragHandleProps && (
          <button
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
        )}
      </div>

      {expanded && (
        <div className="task-reveal">
          {jobLabel && (
            <div className="task-reveal-job">
              <div className="task-reveal-job-copy">
                <span className="task-reveal-job-kicker">
                  Job
                </span>

                <span className="task-reveal-job-name">
                  {jobLabel}
                </span>
              </div>

              <button
                type="button"
                className="task-reveal-job-action"
                onClick={isolate(onOpenDetails)}
              >
                Open
              </button>
            </div>
          )}

          {showProgress && (
            <div className="task-progress-row">
              <div className="task-progress-track">
                <div
                  className="task-progress-fill"
                  style={{
                    width: `${Math.max(
                      progressPct,
                      0
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {(t.due_today ||
            t.location_text ||
            learnedHint) && (
            <div className="task-reveal-meta">
              {t.due_today && (
                <span className="task-reveal-line due">
                  Due today
                </span>
              )}

              {learnedHint && (
                <span className="task-reveal-line">
                  usually ~{learnedHint}
                </span>
              )}

              {t.location_text && (
                <span
                  className="task-reveal-line location"
                  title={t.location_text}
                >
                  <MapPinIcon size={13} />

                  <span className="task-reveal-location-text">
                    {t.location_text}
                  </span>
                </span>
              )}
            </div>
          )}

          <TaskInfo
            value={t.info || ''}
            onSave={(info) =>
              onSaveInfo(t.id, info)
            }
            surface="paper"
          />

          {subs.length > 0 && (
            <div className="task-reveal-subtasks">
              <button
                className={
                  subsOpen
                    ? 'task-reveal-subtasks-head open'
                    : 'task-reveal-subtasks-head'
                }
                onClick={() =>
                  setSubsOpen((o) => !o)
                }
                aria-expanded={subsOpen}
                aria-label="Toggle sub-tasks"
              >
                Subtasks{' '}
                <span className="mono">
                  {doneSubs}/{subs.length}
                </span>

                <span
                  className="subs-head-chev"
                  aria-hidden="true"
                >
                  <ChevronIcon size={12} />
                </span>
              </button>

              {subsOpen &&
                subs.map((s) => (
                  <div
                    key={s.id}
                    className="task-reveal-subtask"
                  >
                    <button
                      className={
                        s.done
                          ? 'subtask-check done'
                          : 'subtask-check'
                      }
                      onPointerDown={stopPointer}
                      onPointerUp={stopPointer}
                      onClick={isolate(() =>
                        onToggleSubtaskDone(
                          s.id,
                          t.id,
                          s.done
                        )
                      )}
                      aria-label="Toggle sub-task"
                    />

                    <span
                      className={
                        s.done
                          ? 'subtask-text done'
                          : 'subtask-text'
                      }
                    >
                      {s.text}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <div className="task-actions">
            {timed && (
              <button
                className="task-action-link"
                disabled={
                  !active && startDisabled
                }
                onPointerDown={stopPointer}
                onPointerUp={stopPointer}
                onClick={isolate(() => {
                  if (active) {
                    onStop(t.id);
                  } else if (!startDisabled) {
                    onStart(t.id);
                  }
                })}
                aria-label={
                  active
                    ? 'Stop timer'
                    : 'Start timer'
                }
              >
                {active ? (
                  <StopIcon />
                ) : (
                  <PlayIcon />
                )}

                <span>
                  {active ? 'Stop' : 'Start'}
                </span>
              </button>
            )}

            {geoAware && onSetRouteIntent ? (
              <div className="task-pill-wrap" ref={travelWrapRef}>
                <button
                  type="button"
                  className={
                    travelOpen
                      ? 'task-pill task-pill-travel open'
                      : 'task-pill task-pill-travel'
                  }
                  aria-expanded={travelOpen}
                  aria-haspopup="listbox"
                  onClick={isolate(() => setTravelOpen((v) => !v))}
                >
                  <span className="task-pill-text">Travel · {travelLabel}</span>
                  <span className="task-pill-chevron" aria-hidden="true">
                    <ChevronIcon />
                  </span>
                </button>
                {travelOpen ? (
                  <div
                    className="task-pill-menu"
                    role="listbox"
                    aria-label="Travel for this task"
                  >
                    <button
                      type="button"
                      role="option"
                      className={
                        t.requires_visit == null
                          ? 'task-pill-option current'
                          : 'task-pill-option'
                      }
                      aria-selected={t.requires_visit == null}
                      onClick={isolate(() => {
                        onSetRouteIntent(t.id, null);
                        setTravelOpen(false);
                      })}
                    >
                      Auto
                      <span className="task-pill-option-hint">Dokkit decides</span>
                    </button>
                    <button
                      type="button"
                      role="option"
                      className={
                        t.requires_visit === true
                          ? 'task-pill-option current'
                          : 'task-pill-option'
                      }
                      aria-selected={t.requires_visit === true}
                      onClick={isolate(() => {
                        onSetRouteIntent(t.id, true);
                        setTravelOpen(false);
                      })}
                    >
                      On route
                      <span className="task-pill-option-hint">Include drive time</span>
                    </button>
                    <button
                      type="button"
                      role="option"
                      className={
                        t.requires_visit === false
                          ? 'task-pill-option current'
                          : 'task-pill-option'
                      }
                      aria-selected={t.requires_visit === false}
                      onClick={isolate(() => {
                        onSetRouteIntent(t.id, false);
                        setTravelOpen(false);
                      })}
                    >
                      Not travel
                      <span className="task-pill-option-hint">Place is context only</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              className="task-pill task-pill-details"
              onClick={isolate(onOpenDetails)}
            >
              Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
