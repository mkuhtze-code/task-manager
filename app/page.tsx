'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import MicButton from '@/components/MicButton';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import {
  buildClusters,
  suggestEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
  suggestLocation,
  suggestsLocation,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { determineBase, nearestNeighborOrder, weaveGeoOrder, type Coords } from '@/lib/todayRoute';
import TopSwitcher from '@/components/TopSwitcher';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';

type Task = {
  id: string;
  text: string;
  status: 'pending' | 'active' | 'done';
  source: 'planned' | 'came_up';
  estimate_mins: number;
  logged_mins: number;
  started_at: string | null;
  due_today: boolean;
  order_index: number;
  created_at: string;
  // Date (YYYY-MM-DD) this task should first become visible. Null/past
  // means "visible now" — the existing, unchanged behavior. A future date
  // means the task is a passive reminder: fully hidden from the list,
  // capacity math, and day rail until that date arrives, at which point
  // it just appears like any other task/list item — no notification,
  // no "overdue" state if a day is missed.
  surface_date: string | null;
  // Optional location — mirrors activities in Travel. drive_mins_to_next
  // is only meaningful in geo_aware sort mode; it's the computed drive
  // time to whichever located task comes next in the geographic route.
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  drive_mins_to_next: number;
};

type Subtask = {
  id: string;
  task_id: string;
  text: string;
  mins: number;
  done: boolean;
};

type Meeting = {
  id: string;
  text: string;
  duration_mins: number;
};

type SortMode = 'capacity_first' | 'due_today_first' | 'manual' | 'oldest_first' | 'newest_first' | 'geo_aware';

type DragState = {
  id: string;
  originalIndex: number;
  currentIndex: number;
  startY: number;
  offsetY: number;
  rowHeight: number;
  orderSnapshot: string[];
};

const HAS_SIGNED_IN_KEY = 'dokkit-has-signed-in';
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];
const LONG_PRESS_MS = 500;
const ROW_GAP = 8;

// Same day-label set used on the Preferences page, so onboarding and
// Preferences look and behave identically rather than as two slightly
// different implementations of the same control.
const DAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
  { label: 'S', value: 0 },
];

function parseMins(raw: string): number | null {
  const str = raw.trim().toLowerCase();
  if (str.length === 0) return 0;
  const last = str.charAt(str.length - 1);
  let unit = 'm';
  let numStr = str;
  if (last === 'h' || last === 'm') {
    unit = last;
    numStr = str.slice(0, -1);
  }
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  return unit === 'h' ? Math.round(num * 60) : Math.round(num);
}

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Turns a raw minute count back into something parseMins() can read, for
// filling in the capture time field when a suggestion chip is tapped.
function minsToInput(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

function fmtClock(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function timeStringToMinutes(t: string): number {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

// Local (not UTC) YYYY-MM-DD, so "Friday" means the user's Friday, not
// whatever day it happens to be in UTC at the time.
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtSurfaceDate(dateStr: string): string {
  // Parse as local, not UTC, to avoid off-by-one day display issues.
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isScheduledForLater(t: Task, todayStr: string): boolean {
  return !!t.surface_date && t.surface_date > todayStr;
}

async function authedFetch(url: string, body: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sortTasks(
  list: Task[],
  mode: SortMode,
  remainingForTaskFn?: (t: Task) => number,
  taskCapacity?: number
): Task[] {
  const arr = [...list];

  if (mode === 'manual') {
    arr.sort((a, b) => a.order_index - b.order_index);
    return arr;
  }
  if (mode === 'oldest_first') {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return arr;
  }
  if (mode === 'newest_first') {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return arr;
  }

  arr.sort((a, b) => {
    const aKey = a.due_today ? 0 : 1;
    const bKey = b.due_today ? 0 : 1;
    if (aKey !== bKey) return aKey - bKey;
    return a.order_index - b.order_index;
  });

  if (mode === 'capacity_first' && remainingForTaskFn && taskCapacity !== undefined) {
    // List items (no time estimate) never compete in the time-based fit
    // calculation — there's no clock pressure to weigh them against, so
    // they'd trivially "fit" and skew the ordering. They get their own
    // calm lane at the bottom instead, in the same due-today/order_index
    // sequence as everything else.
    const timed = arr.filter((t) => t.estimate_mins > 0);
    const listItems = arr.filter((t) => t.estimate_mins <= 0);

    let cumulative = 0;
    const fits: Task[] = [];
    const overflow: Task[] = [];
    for (const t of timed) {
      cumulative += remainingForTaskFn(t);
      if (cumulative <= taskCapacity) {
        fits.push(t);
      } else {
        overflow.push(t);
      }
    }
    return [...fits, ...overflow, ...listItems];
  }

  return arr;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7.6" fill={done ? 'var(--moss)' : 'none'} stroke={done ? 'var(--moss)' : 'var(--line-strong)'} strokeWidth="1.6" />
      <path
        d="M5.3 9.3 L7.7 11.8 L12.7 6"
        fill="none"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="12"
        strokeDashoffset={done ? 0 : 12}
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M7 5.5c0-1.2 1.3-1.9 2.3-1.3l10 6.5c.9.6.9 2 0 2.6l-10 6.5c-1 .6-2.3-.1-2.3-1.3V5.5Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="currentColor" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function FitCheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FitWarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.14l-8.18-14a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const REVEAL_RIGHT = 92;
const OPEN_THRESHOLD = 45;

type OpenSide = 'none' | 'right';

function TaskCard(props: {
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
                    <span className="tag mono">+{fmtMins(t.drive_mins_to_next)} to next stop</span>
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

function TaskDetailSheet(props: {
  task: Task;
  subs: Subtask[];
  remainingForThis: number;
  liveLogged: number;
  anyActive: boolean;
  onClose: () => void;
  onSave: (id: string, text: string, mins: number, surfaceDate: string | null, locationText: string | null, lat: number | null, lng: number | null) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onToggleDue: (id: string, current: boolean) => void;
  onAddSubtask: (id: string) => void;
  onToggleSubtaskDone: (subId: string, taskId: string, current: boolean) => void;
  onDeleteSubtask: (subId: string, taskId: string) => void;
  subDraftText: string;
  subDraftTime: string;
  setSubDraftText: (v: string) => void;
  setSubDraftTime: (v: string) => void;
}) {
  const {
    task, subs, remainingForThis, liveLogged, anyActive, onClose, onSave,
    onComplete, onStart, onStop, onToggleDue, onAddSubtask, onToggleSubtaskDone, onDeleteSubtask,
    subDraftText, subDraftTime, setSubDraftText, setSubDraftTime,
  } = props;

  const [text, setText] = useState(task.text);
  const [timeStr, setTimeStr] = useState(fmtMins(task.estimate_mins));
  const [surfaceDate, setSurfaceDate] = useState(task.surface_date || '');
  const [locationText, setLocationText] = useState(task.location_text || '');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(
    task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setText(task.text);
    setTimeStr(fmtMins(task.estimate_mins));
    setSurfaceDate(task.surface_date || '');
    setLocationText(task.location_text || '');
    setLocationCoords(task.lat != null && task.lng != null ? { lat: task.lat, lng: task.lng } : null);
    setError('');
  }, [task.id]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    const mins = parseMins(timeStr);
    // 0 is valid — that's what makes this a list item / reminder rather
    // than a timed task. Only reject unparseable or negative input.
    if (mins === null || mins < 0) {
      setError('Could not read that time, try 15m, 1.5h, or 0m');
      return;
    }
    setError('');
    onSave(
      task.id,
      trimmed,
      mins,
      surfaceDate.length > 0 ? surfaceDate : null,
      locationText.trim().length > 0 ? locationText.trim() : null,
      locationCoords?.lat ?? null,
      locationCoords?.lng ?? null
    );
  }

  function handleClose() {
    commit();
    onClose();
  }

  const startDisabled = anyActive && task.status !== 'active';

  return (
    <div className="sheet-backdrop" onClick={handleClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <button className="btn-text" onClick={handleClose}>Close</button>
          <button
            className="btn-text"
            onClick={() => {
              commit();
              onClose();
            }}
          >
            Done
          </button>
        </div>

        <input
          type="text"
          className="task-detail-name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />

        {task.estimate_mins > 0 && (
          <div className="task-progress-row" style={{ marginTop: 0 }}>
            <div className="task-progress-track">
              <div
                className="task-progress-fill"
                style={{ width: `${Math.min((1 - remainingForThis / Math.max(task.estimate_mins, 1)) * 100, 100)}%` }}
              />
            </div>
            <span className="task-progress-label mono">{fmtMins(remainingForThis)} left</span>
          </div>
        )}

        <div className="capture-row">
          <input type="text" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} onBlur={commit} style={{ width: 90 }} />
          <button
            className={task.due_today ? 'btn btn-steel' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => onToggleDue(task.id, task.due_today)}
          >
            {task.due_today ? '✓ Due today' : 'Due today'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        <span className="settings-label">Location (optional)</span>
        <LocationAutocomplete
          value={locationText}
          placeholder="Where does this happen?"
          onChange={setLocationText}
          onPlaceSelected={(result) => {
            setLocationText(result.formattedAddress);
            setLocationCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {locationText.length > 0 && !locationCoords && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
            Pick a suggestion from the list so this can factor into route-aware capacity.
          </p>
        )}

        <div className="reminder-date-row">
          <input
            type="date"
            value={surfaceDate}
            onChange={(e) => setSurfaceDate(e.target.value)}
            onBlur={commit}
          />
          {surfaceDate.length > 0 && (
            <button className="btn-text" onClick={() => { setSurfaceDate(''); commit(); }}>
              Clear
            </button>
          )}
        </div>
        {surfaceDate.length > 0 && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 12, margin: 0 }}>
            Hidden from your list until {fmtSurfaceDate(surfaceDate)}.
          </p>
        )}

        <div className="task-detail-actions">
          {task.status === 'active' ? (
            <button className="btn btn-ghost start-stop-btn" style={{ flex: 1 }} onClick={() => onStop(task.id)}>
              <StopIcon /> Stop <span className="mono" style={{ fontWeight: 600 }}>{fmtMins(liveLogged)}</span>
            </button>
          ) : (
            <button className="btn btn-steel start-stop-btn" style={{ flex: 1 }} disabled={startDisabled} onClick={() => onStart(task.id)}>
              <PlayIcon /> Start
            </button>
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { onComplete(task.id); onClose(); }}>
            Complete
          </button>
        </div>

        <div className="subtask-panel">
          <div className="settings-panel-title">Sub-tasks</div>
          {subs.map((s) => (
            <div key={s.id} className="subtask-row">
              <button
                className={s.done ? 'subtask-check done' : 'subtask-check'}
                onClick={() => onToggleSubtaskDone(s.id, task.id, s.done)}
                aria-label="Complete sub-task"
              />
              <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
              <span className="tag mono">{fmtMins(s.mins)}</span>
              <button className="icon-btn" onClick={() => onDeleteSubtask(s.id, task.id)} aria-label="Delete sub-task">×</button>
            </div>
          ))}
          <div className="subtask-add-row">
            <input
              type="text"
              placeholder="Sub-task"
              value={subDraftText}
              onChange={(e) => setSubDraftText(e.target.value)}
            />
            <MicButton
              size="small"
              onResult={(text) =>
                setSubDraftText(subDraftText.trim().length > 0 ? `${subDraftText.trim()} ${text}` : text)
              }
            />
            <input
              type="text"
              placeholder="15m"
              style={{ width: 60 }}
              value={subDraftTime}
              onChange={(e) => setSubDraftTime(e.target.value)}
            />
            <button className="btn btn-ghost" style={{ padding: '4px 10px', minHeight: 32, fontSize: 12 }} onClick={() => onAddSubtask(task.id)}>add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduledSheet(props: {
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, onClose, onOpenTask } = props;
  const sorted = [...tasks].sort((a, b) => (a.surface_date || '').localeCompare(b.surface_date || ''));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">Scheduled</div>
          <button className="btn-text" onClick={onClose}>Close</button>
        </div>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Nothing scheduled for later.</p>
        ) : (
          sorted.map((t) => (
            <div key={t.id} className="scheduled-item">
              <span className="scheduled-item-text">{t.text}</span>
              <button
                className="tag-reminder tag"
                style={{ border: 'none', cursor: 'pointer' }}
                onClick={() => { onOpenTask(t.id); onClose(); }}
                aria-label="Edit reminder"
              >
                {t.surface_date ? fmtSurfaceDate(t.surface_date) : ''}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [hasSignedInBefore, setHasSignedInBefore] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [scheduledSheetOpen, setScheduledSheetOpen] = useState(false);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS);
  const [sortMode, setSortMode] = useState<SortMode>('capacity_first');
  const [captureOpen, setCaptureOpen] = useState(false);

  // ── Home & Work base pins, and the route state geo_aware sort mode
  // depends on. driveFromBaseMins/driveToBaseMins are never persisted —
  // there's no per-day table for Today the way Travel has trip_days, so
  // these are recomputed fresh each time recalcRoute() runs and held only
  // in memory, same tradeoff flagged when this was designed.
  const [homeCoords, setHomeCoords] = useState<Coords | null>(null);
  const [workCoords, setWorkCoords] = useState<Coords | null>(null);
  const [driveFromBaseMins, setDriveFromBaseMins] = useState(0);
  const [driveToBaseMins, setDriveToBaseMins] = useState(0);
  const [recalculatingRoute, setRecalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Gates the first-run welcome/setup screen. Starts false so returning
  // users never see a flash of it before settings load.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardSaving, setOnboardSaving] = useState(false);

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [showReminderField, setShowReminderField] = useState(false);
  const [captureSurfaceDate, setCaptureSurfaceDate] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureLocationCoords, setCaptureLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualLocationToggle, setManualLocationToggle] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  const [dragState, setDragState] = useState<DragState | null>(null);
  const rowElsRef = useRef<Record<string, HTMLDivElement | null>>({});

  // ── The "brain": completed-task history feeds fuzzy clustering, which
  // powers both the capture-time suggestion chip and the capacity math's
  // effective (learned) estimates below. Location suggestions ride the
  // same clusters now — see suggestLocation in taskIntelligence.ts.
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);

  const captureSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestEstimate(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureLocationSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocation(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  // Deterministic phrase heuristic (see suggestsLocation), not AI — fires
  // the optional location field without forcing it on every task.
  const locationFieldVisible = suggestsLocation(taskText) || captureLocation.length > 0 || manualLocationToggle;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSignedInBefore(window.localStorage.getItem(HAS_SIGNED_IN_KEY) === 'true');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && typeof window !== 'undefined') {
      window.localStorage.setItem(HAS_SIGNED_IN_KEY, 'true');
    }
  }, [session]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session) loadEverything();
  }, [session]);

  async function loadEverything() {
    const userId = session.user.id;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, work_days, timezone, sort_mode, onboarded, home_lat, home_lng, work_lat, work_lng')
      .eq('user_id', userId)
      .maybeSingle();

    const detectedTimezone =
      typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setWorkDays(settings.work_days && settings.work_days.length > 0 ? settings.work_days : DEFAULT_WORK_DAYS);
      setSortMode((settings.sort_mode as SortMode) || 'capacity_first');
      if (settings.home_lat != null && settings.home_lng != null) {
        setHomeCoords({ lat: settings.home_lat, lng: settings.home_lng });
      }
      if (settings.work_lat != null && settings.work_lng != null) {
        setWorkCoords({ lat: settings.work_lat, lng: settings.work_lng });
      }
      if (!settings.timezone && detectedTimezone) {
        supabase.from('user_settings').update({ timezone: detectedTimezone }).eq('user_id', userId);
      }
      // onboarded defaults false on the column; only explicit false shows
      // the welcome screen — anything truthy (including rows from before
      // this column existed, which were backfilled to true) skips it.
      if (settings.onboarded === false) {
        setShowOnboarding(true);
      }
    } else {
      await supabase.from('user_settings').insert({
        user_id: userId,
        work_start: '08:00',
        work_end: '16:00',
        work_days: DEFAULT_WORK_DAYS,
        timezone: detectedTimezone,
        sort_mode: 'capacity_first',
        onboarded: false,
      });
      setShowOnboarding(true);
    }

    const { data: taskRows } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'done')
      .order('order_index', { ascending: true });
    setTasks(taskRows || []);

    const { data: meetingRows } = await supabase.from('meetings').select('*');
    setMeetings(meetingRows || []);

    if (taskRows && taskRows.length > 0) {
      const ids = taskRows.map((t: Task) => t.id);
      const { data: subRows } = await supabase.from('subtasks').select('*').in('task_id', ids).order('order_index', { ascending: true });
      const grouped: Record<string, Subtask[]> = {};
      (subRows || []).forEach((s: Subtask) => {
        if (!grouped[s.task_id]) grouped[s.task_id] = [];
        grouped[s.task_id].push(s);
      });
      setSubtasksByTask(grouped);
    }

    // Completed-task history for the learning layer — capped at the most
    // recent 500 so clustering stays cheap even after months of use.
    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng')
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500);
    setHistory(
      (historyRows || []).map((r: any) => ({
        text: r.text,
        actual_mins: r.actual_mins,
        location_text: r.location_text,
        lat: r.lat,
        lng: r.lng,
      }))
    );
  }

  function toggleWorkDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function completeOnboarding() {
    if (!session) return;
    setOnboardSaving(true);
    await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd, work_days: workDays, onboarded: true })
      .eq('user_id', session.user.id);
    setOnboardSaving(false);
    setShowOnboarding(false);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSignInError('Invalid email or password.');
      return;
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setSignInError('Could not send reset email. Please check the email address.');
      return;
    }
    setForgotPasswordSent(true);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    // Explicit shouldCreateUser: false as a second layer on top of the
    // "Allow new users to sign up" toggle in the Supabase dashboard — if
    // that setting ever gets flipped back on by accident, magic-link
    // sign-in still won't silently create new accounts.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setSignInError("Could not send a sign-in link. If you're not on the invite list yet, reach out and we'll get you set up.");
      return;
    }
    setMagicLinkSent(true);
  }

  async function signInWithGoogle() {
    setSigningInWithGoogle(true);
    setSignInError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setSignInError('Failed to sign in with Google.');
      setSigningInWithGoogle(false);
    }
  }

  // Recomputes the geographic route: nearest-neighbor order from whichever
  // base currently applies (client-side, free), then asks the server to
  // fetch real drive times for that exact sequence and persist them.
  // Only meaningful in geo_aware sort mode — every other mode zeroes the
  // route numbers out, since their ordering isn't geographically
  // guaranteed to make sense (the tension flagged when this was designed).
  async function recalcRoute() {
    if (sortMode !== 'geo_aware' || !session) {
      setDriveFromBaseMins(0);
      setDriveToBaseMins(0);
      return;
    }

    const base = determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords);
    if (!base.coords || !base.label) {
      setRouteError('Set a home or work address in Preferences to enable route-aware capacity.');
      setDriveFromBaseMins(0);
      setDriveToBaseMins(0);
      return;
    }

    const located = tasks
      .filter((t) => t.status !== 'done' && t.lat != null && t.lng != null)
      .map((t) => ({ id: t.id, lat: t.lat as number, lng: t.lng as number }));

    if (located.length === 0) {
      setRouteError(null);
      setDriveFromBaseMins(0);
      setDriveToBaseMins(0);
      return;
    }

    const orderedIds = nearestNeighborOrder(base.coords, located);
    setRecalculatingRoute(true);
    setRouteError(null);
    try {
      const json = await authedFetch('/api/today/calculate-route', {
        orderedTaskIds: orderedIds,
        baseLabel: base.label,
      });
      if (json.error) {
        setRouteError(json.error);
      } else {
        setDriveFromBaseMins(json.driveFromBaseMins || 0);
        setDriveToBaseMins(json.driveToBaseMins || 0);
        const { data: taskRows } = await supabase
          .from('tasks')
          .select('*')
          .neq('status', 'done')
          .order('order_index', { ascending: true });
        setTasks(taskRows || []);
      }
    } catch {
      setRouteError('Could not reach the server — check your connection and try again.');
    } finally {
      setRecalculatingRoute(false);
    }
  }

  // Auto-recalculates whenever geo_aware becomes the active sort mode,
  // and zeroes route numbers out the moment it stops being active — so
  // switching away never leaves stale drive-time inflating capacity math
  // in a mode where the order no longer justifies it.
  useEffect(() => {
    if (sortMode === 'geo_aware' && session) {
      recalcRoute();
    } else {
      setDriveFromBaseMins(0);
      setDriveToBaseMins(0);
      setRouteError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, session]);

  async function addTask() {
    const text = taskText.trim();
    if (text.length === 0) return;
    const mins = parseMins(taskTime);
    if (mins === null) {
      setError('Could not read that time, try 15m or 1.5h');
      return;
    }
    setError('');
    const userId = session.user.id;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    const surfaceDate = showReminderField && captureSurfaceDate.length > 0 ? captureSurfaceDate : null;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        text,
        estimate_mins: mins,
        source: 'came_up',
        order_index: maxOrder + 1,
        surface_date: surfaceDate,
        location_text: captureLocation.trim().length > 0 ? captureLocation.trim() : null,
        lat: captureLocationCoords?.lat ?? null,
        lng: captureLocationCoords?.lng ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setTasks((prev) => [...prev, data]);
    setTaskText('');
    setTaskTime('');
    setShowReminderField(false);
    setCaptureSurfaceDate('');
    setCaptureLocation('');
    setCaptureLocationCoords(null);
    setManualLocationToggle(false);
    setCaptureOpen(false);
    if (data.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function updateTask(
    id: string,
    text: string,
    mins: number,
    surfaceDate: string | null,
    locationText: string | null,
    lat: number | null,
    lng: number | null
  ) {
    await supabase
      .from('tasks')
      .update({ text, estimate_mins: mins, surface_date: surfaceDate, location_text: locationText, lat, lng })
      .eq('id', id);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text, estimate_mins: mins, surface_date: surfaceDate, location_text: locationText, lat, lng } : t))
    );
    if (sortMode === 'geo_aware') recalcRoute();
  }

  async function toggleDueToday(id: string, current: boolean) {
    await supabase.from('tasks').update({ due_today: !current }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today: !current } : t)));
  }

  async function startTask(id: string) {
    const alreadyActive = tasks.find((t) => t.status === 'active');
    if (alreadyActive) return;
    const startedAt = new Date().toISOString();
    await supabase.from('tasks').update({ status: 'active', started_at: startedAt, near_notified: false, over_notified: false, last_overdue_ping_at: null }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'active', started_at: startedAt } : t)));
  }

  async function stopTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.started_at) return;
    const sessionMins = (Date.now() - new Date(task.started_at).getTime()) / 60000;
    const newLogged = task.logged_mins + sessionMins;
    await supabase.from('tasks').update({ status: 'pending', started_at: null, logged_mins: newLogged }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'pending', started_at: null, logged_mins: newLogged } : t)));
  }

  async function completeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    let finalLogged = task ? task.logged_mins : 0;
    if (task && task.status === 'active' && task.started_at) {
      finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }
    await supabase
      .from('tasks')
      .update({ status: 'done', started_at: null, logged_mins: finalLogged, actual_mins: Math.round(finalLogged), completed_at: new Date().toISOString() })
      .eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    // Keep the learning layer current without waiting for a full reload —
    // this task's outcome (duration and location alike) should be
    // eligible to inform the very next suggestion, not just after the
    // next page load.
    if (task) {
      setHistory((prev) => [
        {
          text: task.text,
          actual_mins: Math.round(finalLogged),
          location_text: task.location_text,
          lat: task.lat,
          lng: task.lng,
        },
        ...prev,
      ]);
    }
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function deleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function addSubtask(taskId: string) {
    const text = (subDraftText[taskId] || '').trim();
    if (text.length === 0) return;
    const mins = parseMins(subDraftTime[taskId] || '') || 0;
    const userId = session.user.id;
    const existing = subtasksByTask[taskId] || [];
    const { data } = await supabase
      .from('subtasks')
      .insert({ user_id: userId, task_id: taskId, text, mins, order_index: existing.length })
      .select()
      .single();
    if (data) {
      setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), data] }));
    }
    setSubDraftText((prev) => ({ ...prev, [taskId]: '' }));
    setSubDraftTime((prev) => ({ ...prev, [taskId]: '' }));
  }

  async function toggleSubtaskDone(subtaskId: string, taskId: string, current: boolean) {
    await supabase.from('subtasks').update({ done: !current }).eq('id', subtaskId);
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((s) => (s.id === subtaskId ? { ...s, done: !current } : s)),
    }));
  }

  async function deleteSubtask(subtaskId: string, taskId: string) {
    await supabase.from('subtasks').delete().eq('id', subtaskId);
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).filter((s) => s.id !== subtaskId),
    }));
  }

  // ── Manual drag-to-reorder ─────────────────────────────────────
  function handleDragHandlePointerDown(e: React.PointerEvent, taskId: string, currentOrderIds: string[]) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const originalIndex = currentOrderIds.indexOf(taskId);
    const rowEl = rowElsRef.current[taskId];
    const rect = rowEl?.getBoundingClientRect();
    const rowHeight = (rect?.height || 60) + ROW_GAP;
    setDragState({
      id: taskId,
      originalIndex,
      currentIndex: originalIndex,
      startY: e.clientY,
      offsetY: 0,
      rowHeight,
      orderSnapshot: currentOrderIds,
    });
  }

  function handleDragHandlePointerMove(e: React.PointerEvent) {
    setDragState((prev) => {
      if (!prev) return prev;
      const deltaY = e.clientY - prev.startY;
      const indexShift = Math.round(deltaY / prev.rowHeight);
      const maxIndex = prev.orderSnapshot.length - 1;
      const nextIndex = Math.min(Math.max(prev.originalIndex + indexShift, 0), maxIndex);
      return { ...prev, offsetY: deltaY, currentIndex: nextIndex };
    });
  }

  async function handleDragHandlePointerUp() {
    const finalState = dragState;
    setDragState(null);
    if (!finalState) return;
    const { id, originalIndex, currentIndex, orderSnapshot } = finalState;
    if (currentIndex === originalIndex) return;

    const newOrderIds = [...orderSnapshot];
    newOrderIds.splice(originalIndex, 1);
    newOrderIds.splice(currentIndex, 0, id);

    setTasks((prev) => {
      const byId: Record<string, Task> = {};
      prev.forEach((t) => (byId[t.id] = t));
      const reindexed = newOrderIds.filter((tid) => byId[tid]).map((tid, idx) => ({ ...byId[tid], order_index: idx }));
      const others = prev.filter((t) => !newOrderIds.includes(t.id));
      return [...reindexed, ...others];
    });

    await Promise.all(
      newOrderIds.map((tid, idx) => supabase.from('tasks').update({ order_index: idx }).eq('id', tid))
    );
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-eyebrow">Dokkit</div>
          {hasSignedInBefore && !isNewUser && !showForgotPassword ? (
            <>
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-sub">Sign in with your email and password.</p>
              
              <button 
                type="button" 
                className="btn btn-google"
                onClick={signInWithGoogle}
                disabled={signingInWithGoogle}
              >
                {signingInWithGoogle ? 'Signing in...' : 'Sign in with Google'}
              </button>

              <div className="auth-divider">or</div>

              <form onSubmit={signInWithPassword} className="auth-form">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
                <button type="submit" className="btn btn-steel">Sign in</button>
                {signInError && <p className="auth-error">{signInError}</p>}
              </form>
              <button 
                className="btn-text" 
                onClick={() => setShowForgotPassword(true)} 
                style={{ marginTop: 'var(--space-3)' }}
              >
                Forgot password?
              </button>
              <button 
                className="btn-text" 
                onClick={() => setIsNewUser(true)} 
                style={{ marginTop: 'var(--space-2)' }}
              >
                New user? Sign up
              </button>
            </>
          ) : showForgotPassword ? (
            <>
              <h1 className="auth-title">Reset password</h1>
              <p className="auth-sub">Enter your email to receive a password reset link.</p>
              {forgotPasswordSent ? (
                <>
                  <p className="auth-sent">Check your email for a password reset link.</p>
                  <button 
                    className="btn-text" 
                    onClick={() => { 
                      setForgotPasswordSent(false); 
                      setShowForgotPassword(false); 
                      setEmail(''); 
                    }} 
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Back to sign in
                  </button>
                </>
              ) : (
                <>
                  <form onSubmit={handleForgotPassword} className="auth-form">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                    <button type="submit" className="btn btn-steel">Send reset link</button>
                    {signInError && <p className="auth-error">{signInError}</p>}
                  </form>
                  <button 
                    className="btn-text" 
                    onClick={() => setShowForgotPassword(false)} 
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className="auth-title">{isNewUser ? 'Set up Dokkit' : 'Get started'}</h1>
              <p className="auth-sub">
                {isNewUser ? 'Sign up with Google or create a password-protected account.' : 'A personal thinking tool that understands time.'}
              </p>
              
              <button 
                type="button" 
                className="btn btn-google"
                onClick={signInWithGoogle}
                disabled={signingInWithGoogle}
              >
                {signingInWithGoogle ? 'Signing in...' : 'Sign up with Google'}
              </button>

              <div className="auth-divider">or</div>

              {magicLinkSent ? (
                <>
                  <p className="auth-sent">Check your email for a sign-in link.</p>
                  <button 
                    className="btn-text" 
                    onClick={() => { 
                      setMagicLinkSent(false); 
                      setEmail(''); 
                      setPassword(''); 
                    }} 
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Back
                  </button>
                </>
              ) : (
                <form onSubmit={handleMagicLink} className="auth-form">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <button type="submit" className="btn btn-steel">Send magic link</button>
                  {signInError && <p className="auth-error">{signInError}</p>}
                </form>
              )}
              {isNewUser && hasSignedInBefore && (
                <button 
                  className="btn-text" 
                  onClick={() => setIsNewUser(false)} 
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  Already have an account?
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-eyebrow">Welcome to Dokkit</div>
          <h1 className="auth-title">Let's get set up</h1>
          <p className="auth-sub">
            Dokkit is a personal thinking tool that understands time — a digital sticky note,
            not a productivity scoreboard. Add what's on your plate with a rough time estimate,
            and Dokkit shows you what realistically fits before your day runs out.
          </p>

          <div className="settings-panel-title" style={{ marginBottom: 'var(--space-2)' }}>Work hours</div>
          <div className="settings-row">
            <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            <span>to</span>
            <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
          </div>

          <span className="settings-label" style={{ display: 'block', marginTop: 'var(--space-3)' }}>Work days</span>
          <div className="day-toggle-row" style={{ marginTop: 'var(--space-2)' }}>
            {DAY_OPTIONS.map((d) => (
              <button
                key={d.value}
                className={workDays.includes(d.value) ? 'day-toggle-btn active' : 'day-toggle-btn'}
                onClick={() => toggleWorkDay(d.value)}
                aria-label={d.label}
              >
                {d.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-steel"
            style={{ width: '100%', marginTop: 'var(--space-5)' }}
            onClick={completeOnboarding}
            disabled={onboardSaving}
          >
            {onboardSaving ? 'Setting up…' : "Let's go"}
          </button>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 'var(--space-2)' }}>
            You can change these anytime in Preferences.
          </p>
        </div>
      </div>
    );
  }

  function completedSubtaskMins(taskId: string): number {
    return (subtasksByTask[taskId] || []).filter((s) => s.done).reduce((sum, s) => sum + s.mins, 0);
  }

  // Display-facing remaining time: driven purely by what the person typed.
  // Never silently changes — this is "what does the progress bar on this
  // specific task say", and it should always match what you set.
  function remainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
  }

  // Capacity-facing remaining time: the "brain". Blends the typed estimate
  // with what history says this kind of task actually takes, so the
  // aggregate capacity picture (the ring, the day rail, overflow flags,
  // capacity_first sort) is calibrated by reality — without ever touching
  // the number the person actually sees on the task itself.
  function effectiveRemainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    if (t.estimate_mins <= 0) {
      return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
    }
    const suggestion = suggestEstimate(t.text, history, clusters);
    const effEstimate = effectiveEstimate(t.estimate_mins, suggestion);
    return Math.max(effEstimate - logged - completedSubtaskMins(t.id), 0);
  }

  const todayStr = localDateStr(now);

  // Reminders (future surface_date) are excluded here, before anything
  // else touches capacity, sort, or the day rail — they don't exist for
  // any time-pressure purpose until their date arrives.
  const visibleTasks = tasks.filter((t) => !isScheduledForLater(t, todayStr));
  const scheduledTasks = tasks.filter((t) => isScheduledForLater(t, todayStr));

  const meetingMins = meetings.reduce((sum, m) => sum + m.duration_mins, 0);

  const todayDow = now.getDay();
  const isWorkDay = workDays.includes(todayDow);

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workStartMinutes = timeStringToMinutes(workStart);
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = isWorkDay ? Math.max(workEndMinutes - nowMinutesOfDay, 0) : 0;
  const taskCapacity = minutesLeftToday - meetingMins;

  const geoAware = sortMode === 'geo_aware';
  const currentBase = geoAware ? determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords) : { coords: null, label: null };

  let ordered: Task[];
  if (geoAware && currentBase.coords) {
    const locatedForOrder = visibleTasks
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ id: t.id, lat: t.lat as number, lng: t.lng as number }));
    const structuralOrder = [...visibleTasks].sort((a, b) => a.order_index - b.order_index);
    const geoIds = nearestNeighborOrder(currentBase.coords, locatedForOrder);
    ordered = weaveGeoOrder(structuralOrder as any, geoIds) as Task[];
  } else if (geoAware) {
    // geo_aware selected but no base configured — falls back to manual
    // order rather than pretending a route exists.
    ordered = sortTasks(visibleTasks, 'manual');
  } else {
    ordered = sortTasks(visibleTasks, sortMode, effectiveRemainingForTask, taskCapacity);
  }
  const orderedIds = ordered.map((t) => t.id);

  // Route drive time only enters capacity math in geo_aware mode — every
  // located task's drive_mins_to_next (the between-stop legs the server
  // persisted) plus the two base legs held in local state.
  const locatedDriveSum = geoAware
    ? visibleTasks.filter((t) => t.lat != null && t.lng != null).reduce((sum, t) => sum + (t.drive_mins_to_next || 0), 0)
    : 0;
  const routeDriveMins = geoAware ? driveFromBaseMins + driveToBaseMins + locatedDriveSum : 0;

  const remainingTaskMins = ordered.reduce((sum, t) => sum + effectiveRemainingForTask(t), 0);
  const remainingWorkMins = meetingMins + remainingTaskMins + routeDriveMins;

  const overloaded = isWorkDay && minutesLeftToday > 0 && remainingWorkMins > minutesLeftToday;

  let cumulative = 0;

  const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateOnlyLabel = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const trackSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const nowPercent = Math.min(Math.max((nowMinutesOfDay - workStartMinutes) / trackSpan, 0), 1);
  const projectedFinishMinutes = nowMinutesOfDay + remainingWorkMins;
  const projectedPercent = (projectedFinishMinutes - workStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) || null : null;

  let openTaskRemaining = 0;
  let openTaskLiveLogged = 0;
  if (openTask) {
    openTaskRemaining = remainingForTask(openTask);
    openTaskLiveLogged = openTask.logged_mins;
    if (openTask.status === 'active' && openTask.started_at) {
      openTaskLiveLogged += (Date.now() - new Date(openTask.started_at).getTime()) / 60000;
    }
  }

  const activeTask = visibleTasks.find((t) => t.status === 'active') || null;
  let activeLiveLogged = 0;
  if (activeTask && activeTask.started_at) {
    activeLiveLogged = activeTask.logged_mins + (Date.now() - new Date(activeTask.started_at).getTime()) / 60000;
  }
  const activeOverEstimate = !!activeTask && activeTask.estimate_mins > 0 && activeLiveLogged > activeTask.estimate_mins;

  return (
    <div className="app-shell">
      <TopSwitcher active="today" />
      <TravelAwarenessBanner />

      <div
        className={overloaded ? 'today-header-card overloaded' : 'today-header-card'}
        onClick={() => router.push('/analytics')}
      >
        <div className="today-header-top-row">
          <div className="today-header-date-block">
            <div className="today-header-weekday">{weekdayLabel}</div>
            <div className="today-header-date">{dateOnlyLabel}</div>
          </div>
          <GearMenu />
        </div>

        {activeTask && (
          <div
            className={activeOverEstimate ? 'header-active-strip over' : 'header-active-strip'}
            onClick={(e) => { e.stopPropagation(); setOpenTaskId(activeTask.id); }}
          >
            <span className="header-active-dot" />
            <span className="header-active-text">{activeTask.text}</span>
            <span className="header-active-elapsed mono">{fmtMins(activeLiveLogged)}</span>
            <button
              className="header-active-stop"
              onClick={(e) => { e.stopPropagation(); stopTask(activeTask.id); }}
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
                <button
                  className="btn-text"
                  style={{ padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); recalcRoute(); }}
                  disabled={recalculatingRoute}
                >
                  {recalculatingRoute
                    ? 'Recalculating route…'
                    : currentBase.label
                      ? `Recalculate route (from ${currentBase.label === 'work' ? 'office' : 'home'})`
                      : 'Recalculate route'}
                </button>
                {!recalculatingRoute && currentBase.label && (driveFromBaseMins > 0 || driveToBaseMins > 0) && (
                  <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '4px 0 0' }}>
                    {fmtMins(driveFromBaseMins)} from {currentBase.label === 'work' ? 'office' : 'home'} to first stop ·{' '}
                    {fmtMins(driveToBaseMins)} back at the end
                  </p>
                )}
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

      <div className="task-list">
        {ordered.length === 0 && (
          <div className="empty-state">Nothing on your plate yet.<br />Tap + to add something.</div>
        )}
        {ordered.map((t, idx) => {
          const remainingForThis = remainingForTask(t);
          const effectiveRemaining = effectiveRemainingForTask(t);
          cumulative += effectiveRemaining;
          // List items (no estimate) can never be "over capacity" — there's
          // no time on the clock for them to compete for.
          const overCap = t.estimate_mins > 0 && cumulative > taskCapacity;
          const anyActive = visibleTasks.some((x) => x.status === 'active');
          const subs = subtasksByTask[t.id] || [];
          let liveLogged = t.logged_mins;
          if (t.status === 'active' && t.started_at) {
            liveLogged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
          }

          const suggestion = t.estimate_mins > 0 ? suggestEstimate(t.text, history, clusters) : null;
          const learnedHint =
            suggestion && hasMeaningfulDivergence(t.estimate_mins, suggestion.suggestedMins)
              ? fmtMins(suggestion.suggestedMins)
              : null;

          let rowStyle: React.CSSProperties = {};
          if (dragState) {
            if (t.id === dragState.id) {
              rowStyle = {
                transform: `translateY(${dragState.offsetY}px) scale(1.02)`,
                transition: 'none',
                zIndex: 30,
                position: 'relative',
                boxShadow: '0 10px 24px rgba(26,41,51,0.3)',
              };
            } else {
              const { originalIndex, currentIndex, rowHeight } = dragState;
              let shift = 0;
              if (originalIndex < currentIndex && idx > originalIndex && idx <= currentIndex) shift = -1;
              else if (originalIndex > currentIndex && idx >= currentIndex && idx < originalIndex) shift = 1;
              rowStyle = {
                transform: `translateY(${shift * rowHeight}px)`,
                transition: 'transform 0.2s var(--ease)',
                position: 'relative',
                zIndex: 1,
              };
            }
          }

          return (
            <div key={t.id} ref={(el) => { rowElsRef.current[t.id] = el; }} style={rowStyle}>
              <TaskCard
                task={t}
                remainingForThis={remainingForThis}
                liveLogged={liveLogged}
                overCap={overCap}
                anyActive={anyActive}
                subs={subs}
                learnedHint={learnedHint}
                showDrive={geoAware}
                openSwipeId={openSwipeId}
                setOpenSwipeId={setOpenSwipeId}
                onComplete={completeTask}
                onStart={startTask}
                onStop={stopTask}
                onOpen={setOpenTaskId}
                dragHandleProps={
                  sortMode === 'manual'
                    ? {
                        onPointerDown: (e) => handleDragHandlePointerDown(e, t.id, orderedIds),
                        onPointerMove: handleDragHandlePointerMove,
                        onPointerUp: handleDragHandlePointerUp,
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
        {scheduledTasks.length > 0 && (
          <div className="scheduled-link-row">
            <button className="btn-text" onClick={() => setScheduledSheetOpen(true)}>
              {scheduledTasks.length} scheduled for later
            </button>
          </div>
        )}
      </div>

      {captureOpen && (
        <div className="capture-sheet">
          <div className="capture-text-row">
            <input
              type="text"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              placeholder="What needs doing?"
            />
            <MicButton
              onResult={(text) =>
                setTaskText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text))
              }
            />
          </div>
          {captureSuggestion && (
            <button
              type="button"
              className="estimate-suggestion-chip"
              onClick={() => setTaskTime(minsToInput(captureSuggestion.suggestedMins))}
            >
              ≈ {fmtMins(captureSuggestion.suggestedMins)} usual ({captureSuggestion.sampleCount}×)
            </button>
          )}
          <div className="capture-row">
            <input
              type="text"
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              placeholder="0m"
              style={{ width: 80 }}
            />
            <button className="btn btn-steel" style={{ flex: 1 }} onClick={addTask}>Add task</button>
          </div>

          {!locationFieldVisible ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setManualLocationToggle(true)}
            >
              + Add a location
            </button>
          ) : (
            <>
              <LocationAutocomplete
                value={captureLocation}
                placeholder="Where does this happen?"
                onChange={setCaptureLocation}
                onPlaceSelected={(result) => {
                  setCaptureLocation(result.formattedAddress);
                  setCaptureLocationCoords({ lat: result.lat, lng: result.lng });
                }}
              />
              {captureLocationSuggestion && !captureLocationCoords && (
                <button
                  type="button"
                  className="estimate-suggestion-chip"
                  onClick={() => {
                    setCaptureLocation(captureLocationSuggestion.location.text);
                    setCaptureLocationCoords({ lat: captureLocationSuggestion.location.lat, lng: captureLocationSuggestion.location.lng });
                  }}
                >
                  📍 {captureLocationSuggestion.location.text} usual ({captureLocationSuggestion.sampleCount}×)
                </button>
              )}
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setCaptureLocation('');
                  setCaptureLocationCoords(null);
                  setManualLocationToggle(false);
                }}
              >
                Remove location
              </button>
            </>
          )}

          {!showReminderField ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setShowReminderField(true)}
            >
              Remind me later instead
            </button>
          ) : (
            <div className="reminder-date-row">
              <input
                type="date"
                value={captureSurfaceDate}
                onChange={(e) => setCaptureSurfaceDate(e.target.value)}
              />
              <button
                type="button"
                className="btn-text"
                onClick={() => { setShowReminderField(false); setCaptureSurfaceDate(''); }}
              >
                Cancel
              </button>
            </div>
          )}
          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          <button className="btn-text" onClick={() => setCaptureOpen(false)}>Cancel</button>
        </div>
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Dock it">+</button>
      )}

      {openTask && (
        <TaskDetailSheet
          task={openTask}
          subs={subtasksByTask[openTask.id] || []}
          remainingForThis={openTaskRemaining}
          liveLogged={openTaskLiveLogged}
          anyActive={visibleTasks.some((x) => x.status === 'active')}
          onClose={() => setOpenTaskId(null)}
          onSave={updateTask}
          onComplete={completeTask}
          onStart={startTask}
          onStop={stopTask}
          onToggleDue={toggleDueToday}
          onAddSubtask={addSubtask}
          onToggleSubtaskDone={toggleSubtaskDone}
          onDeleteSubtask={deleteSubtask}
          subDraftText={subDraftText[openTask.id] || ''}
          subDraftTime={subDraftTime[openTask.id] || ''}
          setSubDraftText={(v) => setSubDraftText((prev) => ({ ...prev, [openTask.id]: v }))}
          setSubDraftTime={(v) => setSubDraftTime((prev) => ({ ...prev, [openTask.id]: v }))}
        />
      )}

      {scheduledSheetOpen && (
        <ScheduledSheet
          tasks={scheduledTasks}
          onClose={() => setScheduledSheetOpen(false)}
          onOpenTask={(id) => setOpenTaskId(id)}
        />
      )}
    </div>
  );
}
