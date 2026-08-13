'use client';

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
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleSubtaskDone: (subtaskId: string, taskId: string, current: boolean) => void;
  onSaveInfo: (id: string, info: string) => void;
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}) {
  const {
    task: t, remainingForThis, liveLogged, overCap, anyActive, subs, learnedHint,
    expanded, onToggleExpand, onOpenDetails, onComplete, onStart, onStop,
    onToggleSubtaskDone, onSaveInfo, dragHandleProps,
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
  ].join(' ').trim();

  const doneSubs = subs.filter((s) => s.done).length;

  // Exactly one quiet glance signal per card:
  //  - timed + running → elapsed time + active dot
  //  - timed + idle    → remaining time
  //  - untimed + subs  → subtask progress (2/4)
  //  - plain untimed   → nothing (the card is just its name)
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

  // Stops pointer/click bubbling so inner controls never toggle the card,
  // then runs the action.
  function isolate(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
    };
  }

  const stopPointer = (e: React.PointerEvent) => e.stopPropagation();

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
          aria-label={`${t.text} — ${expanded ? 'collapse' : 'expand'}`}
        >
          <div className="task-text">{t.text}</div>
        </div>
        <div className="task-card-glance" onClick={onToggleExpand}>
          {running && <span className="task-card-active-dot" />}
          {glanceRight && (
            <span className={glanceKind === 'elapsed' ? 'task-card-elapsed mono' : 'task-card-time mono'}>{glanceRight}</span>
          )}
          <span className={expanded ? 'task-card-chevron open' : 'task-card-chevron'} aria-hidden="true">
            <ChevronIcon size={14} />
          </span>
        </div>
        {dragHandleProps && (
          <button
            className="drag-handle-btn"
            onPointerDown={(e) => { e.stopPropagation(); dragHandleProps.onPointerDown(e); }}
            onPointerMove={(e) => { e.stopPropagation(); dragHandleProps.onPointerMove(e); }}
            onPointerUp={(e) => { e.stopPropagation(); dragHandleProps.onPointerUp(e); }}
            onPointerCancel={(e) => { e.stopPropagation(); dragHandleProps.onPointerUp(e); }}
            aria-label="Drag to reorder"
          >
            <DragHandleIcon />
          </button>
        )}
      </div>

      {expanded && (
        <div className="task-reveal">
          {timed && (
            <div className="task-progress-row">
              <div className="task-progress-track">
                <div
                  className="task-progress-fill"
                  style={{ width: `${Math.min((1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="task-progress-label mono">{fmtMins(remainingForThis)} remaining</span>
            </div>
          )}

          {(t.due_today || t.location_text || learnedHint) && (
            <div className="task-reveal-meta">
              {t.due_today && <span className="task-reveal-line due">Due today</span>}
              {learnedHint && <span className="task-reveal-line">usually ~{learnedHint}</span>}
              {t.location_text && (
                <span className="task-reveal-line location" title={t.location_text}>
                  <MapPinIcon size={13} />
                  <span className="task-reveal-location-text">{t.location_text}</span>
                </span>
              )}
            </div>
          )}

          <TaskInfo
            value={t.info || ''}
            onSave={(info) => onSaveInfo(t.id, info)}
            surface="paper"
          />

          {subs.length > 0 && (
            <div className="task-reveal-subtasks">
              <div className="task-reveal-subtasks-head">
                Subtasks <span className="mono">{doneSubs}/{subs.length}</span>
              </div>
              {subs.map((s) => (
                <div key={s.id} className="task-reveal-subtask">
                  <button
                    className={s.done ? 'subtask-check done' : 'subtask-check'}
                    onPointerDown={stopPointer}
                    onPointerUp={stopPointer}
                    onClick={isolate(() => onToggleSubtaskDone(s.id, t.id, s.done))}
                    aria-label="Toggle sub-task"
                  />
                  <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
                  {s.mins > 0 && <span className="task-reveal-subtask-mins mono">{fmtMins(s.mins)}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="task-actions">
            {timed && (
              <button
                className={active ? 'task-action-btn stop' : 'task-action-btn primary'}
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
            )}
            <button className="task-action-link" onClick={isolate(onOpenDetails)}>
              Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
