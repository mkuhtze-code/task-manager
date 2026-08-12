'use client';

import { useEffect, useRef, useState } from 'react';
import { LONG_PRESS_MS, type Subtask, type Task } from '@/lib/taskTypes';
import { fmtMins } from '@/lib/timeFormat';
import {
  CheckIcon,
  ChevronIcon,
  DragHandleIcon,
  MapPinIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';

const REVEAL_RIGHT = 92;
const OPEN_THRESHOLD = 45;

type OpenSide = 'none' | 'right';

export function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
  anyActive: boolean;
  subs: Subtask[];
  learnedHint: string | null;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleSubtaskDone: (subtaskId: string, taskId: string, current: boolean) => void;
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}) {
  const {
    task: t, remainingForThis, liveLogged, overCap, anyActive, subs, learnedHint,
    openSwipeId, setOpenSwipeId, expanded, onToggleExpand, onOpenDetails,
    onComplete, onStart, onStop, onToggleSubtaskDone, dragHandleProps,
  } = props;

  const [dragX, setDragX] = useState(0);
  const [openSide, setOpenSide] = useState<OpenSide>('none');
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef({ v: false });
  const axisRef = useRef<{ v: 'none' | 'x' | 'y' }>({ v: 'none' });
  const longPressFiredRef = useRef({ v: false });
  const longPressTimer = useRef<{ id: any }>({ id: null });

  useEffect(() => {
    if (openSwipeId !== t.id && openSide !== 'none') {
      setOpenSide('none');
      setDragX(0);
    }
  }, [openSwipeId]);

  const startDisabled = anyActive && t.status !== 'active';
  const isListItem = t.estimate_mins <= 0;
  const active = t.status === 'active';
  const timed = t.estimate_mins > 0;

  function handlePointerDown(e: React.PointerEvent) {
    startXRef.current.x = e.clientX;
    startXRef.current.y = e.clientY;
    movedRef.current.v = false;
    axisRef.current.v = 'none';
    longPressFiredRef.current.v = false;
    setDragging(true);
    longPressTimer.current.id = setTimeout(() => {
      if (!movedRef.current.v) {
        longPressFiredRef.current.v = true;
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const dx = e.clientX - startXRef.current.x;
    const dy = e.clientY - startXRef.current.y;
    if (axisRef.current.v === 'none') {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        if (Math.abs(dx) > Math.abs(dy)) {
          axisRef.current.v = 'x';
          movedRef.current.v = true;
          clearTimeout(longPressTimer.current.id);
        } else {
          axisRef.current.v = 'y';
        }
      }
    }
    if (axisRef.current.v === 'x') {
      movedRef.current.v = true;
      clearTimeout(longPressTimer.current.id);
      const base = openSide === 'right' ? REVEAL_RIGHT : 0;
      const next = Math.max(Math.min(base + dx, REVEAL_RIGHT), 0);
      setDragX(next);
    }
  }

  function handlePointerUp() {
    clearTimeout(longPressTimer.current.id);
    setDragging(false);
    if (axisRef.current.v === 'x') {
      if (dragX >= OPEN_THRESHOLD) {
        setOpenSide('right');
        setDragX(REVEAL_RIGHT);
        setOpenSwipeId(t.id);
      } else {
        setOpenSide('none');
        setDragX(0);
        if (openSwipeId === t.id) setOpenSwipeId(null);
      }
    }
  }

  function handleBodyClick() {
    if (openSide !== 'none') {
      setOpenSide('none');
      setDragX(0);
      if (openSwipeId === t.id) setOpenSwipeId(null);
    } else {
      onToggleExpand();
    }
  }

  // Stops pointer/click bubbling so inner controls don't start a swipe or
  // toggle the card, then runs the action. Mirrors the old check-btn
  // stopPropagation wiring for every control inside the revealed tier.
  function isolate(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
    };
  }

  const stopPointer = (e: React.PointerEvent) => e.stopPropagation();

  function closeAnd(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
      setDragX(0);
      setOpenSide('none');
      if (openSwipeId === t.id) setOpenSwipeId(null);
    };
  }

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
  const glanceRight = active ? fmtMins(liveLogged) : timed ? fmtMins(remainingForThis) : null;

  return (
    <div className={rowClass}>
      <div className="swipe-zone">
        <button
          className="swipe-reveal-right start-stop-btn"
          style={{ background: active ? 'var(--hazard)' : 'var(--steel)', opacity: startDisabled && !active ? 0.4 : 1 }}
          disabled={startDisabled && !active}
          onPointerUp={closeAnd(() => {
            if (active) onStop(t.id);
            else if (!startDisabled) onStart(t.id);
          })}
          aria-label={active ? 'Stop' : 'Start'}
        >
          {active ? <StopIcon /> : <PlayIcon />}
          <span>{active ? 'Stop' : 'Start'}</span>
        </button>
        <div
          className="swipe-foreground"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : 'transform 0.3s var(--spring)' }}
        >
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
              onClick={handleBodyClick}
              role="button"
              aria-expanded={expanded}
              aria-label={`${t.text} — ${expanded ? 'collapse' : 'expand'}`}
            >
              <div className="task-text">{t.text}</div>
            </div>
            <div className="task-card-glance" onClick={handleBodyClick}>
              {active && <span className="task-card-active-dot" />}
              {glanceRight && (
                <span className={active ? 'task-card-elapsed mono' : 'task-card-time mono'}>{glanceRight}</span>
              )}
              <span className={expanded ? 'task-card-chevron open' : 'task-card-chevron'} aria-hidden="true">
                <ChevronIcon size={14} />
              </span>
            </div>
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
                  <span className="task-progress-label mono">{fmtMins(remainingForThis)} left</span>
                </div>
              )}

              <div className="task-reveal-meta">
                {active && <span className="task-reveal-chip mono">elapsed {fmtMins(liveLogged)}</span>}
                {t.due_today && <span className="task-reveal-chip due">due today</span>}
                {overCap && <span className="task-reveal-chip warn">over today</span>}
                {learnedHint && <span className="task-reveal-chip">usually ~{learnedHint}</span>}
                {t.location_text && (
                  <span className="task-reveal-location" title={t.location_text}>
                    <MapPinIcon size={13} />
                    <span className="task-reveal-location-text">{t.location_text}</span>
                  </span>
                )}
              </div>

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
                <button
                  className="task-action-btn ghost"
                  onPointerDown={stopPointer}
                  onPointerUp={stopPointer}
                  onClick={isolate(() => onComplete(t.id))}
                >
                  <CheckIcon done={false} />
                  <span>Complete</span>
                </button>
                <button className="task-action-link" onClick={isolate(onOpenDetails)}>
                  Details
                </button>
                {dragHandleProps && (
                  <button
                    className="drag-handle-btn task-action-drag"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
