'use client';

import { useEffect, useRef, useState } from 'react';
import { LONG_PRESS_MS, type Subtask, type Task } from '@/lib/taskTypes';
import { fmtMins } from '@/lib/timeFormat';
import { CheckIcon, PlayIcon, StopIcon, DragHandleIcon } from '@/components/icons';

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
  showDrive: boolean;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onOpen: (id: string) => void;
  dragHandleProps?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}) {
  const {
    task: t, remainingForThis, liveLogged, overCap, anyActive, subs, learnedHint, showDrive,
    openSwipeId, setOpenSwipeId, onComplete, onStart, onStop, onOpen,
    dragHandleProps,
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
      onOpen(t.id);
    }
  }

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
    'task-row',
    t.source === 'came_up' ? 'came-up' : '',
    taskColorClass,
    isListItem ? 'task-list-item' : '',
  ].join(' ').trim();

  const hasExtraTags =
    t.status === 'active' || subs.length > 0 || t.due_today || learnedHint || t.location_text || (showDrive && t.drive_mins_to_next > 0);

  return (
    <div className={rowClass}>
      <div className="swipe-zone">
        <button
          className="swipe-reveal-right start-stop-btn"
          style={{ background: t.status === 'active' ? 'var(--hazard)' : 'var(--steel)', opacity: startDisabled && t.status !== 'active' ? 0.4 : 1 }}
          disabled={startDisabled && t.status !== 'active'}
          onPointerUp={closeAnd(() => {
            if (t.status === 'active') onStop(t.id);
            else if (!startDisabled) onStart(t.id);
          })}
          aria-label={t.status === 'active' ? 'Stop' : 'Start'}
        >
          {t.status === 'active' ? <StopIcon /> : <PlayIcon />}
          <span>{t.status === 'active' ? 'Stop' : 'Start'}</span>
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
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onComplete(t.id); }}
              aria-label="Complete task"
            >
              <CheckIcon done={false} />
            </button>
            <div className="task-body" onClick={handleBodyClick}>
              <div className="task-text">{t.text}</div>
              {t.estimate_mins > 0 && (
                <div className="task-progress-row">
                  <div className="task-progress-track">
                    <div
                      className="task-progress-fill"
                      style={{ width: `${Math.min((1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="task-progress-label mono">{fmtMins(remainingForThis)}</span>
                </div>
              )}
              {hasExtraTags && (
                <div className="task-tags">
                  {t.status === 'active' && <span className="tag tag-elapsed mono">elapsed {fmtMins(liveLogged)}</span>}
                  {subs.length > 0 && <span className="tag">{subs.filter((s) => s.done).length}/{subs.length} sub-tasks</span>}
                  {t.due_today && <span className="tag tag-due">due today</span>}
                  {learnedHint && <span className="tag">usually ~{learnedHint}</span>}
                  {t.location_text && (
                    <span
                      className="tag"
                      style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
                      title={t.location_text}
                    >
                      {t.location_text}
                    </span>
                  )}
                  {showDrive && t.drive_mins_to_next > 0 && (
                    <span className="tag mono">+{fmtMins(t.drive_mins_to_next)} drive</span>
                  )}
                </div>
              )}
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
        </div>
      </div>
    </div>
  );
}
