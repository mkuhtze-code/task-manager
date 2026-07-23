'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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
  notes: string | null;
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

function timeStringToMinutes(t: string): number {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 18 18">
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

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        d="M12.8 1.8l3.4 3.4-9 9-4 0.9 0.9-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path d="M5.5 3.2v11.6l9.5-5.8z" fill="white" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <rect x="4.5" y="4.5" width="9" height="9" rx="1.5" fill="white" />
    </svg>
  );
}

function DokkitMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dokkit">
      <path
        fill="var(--steel)"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14 6h11.5l1.6 2.4a2 2 0 0 0 1.664.89h6.472a2 2 0 0 0 1.664-.89L38.5 6H50a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8Zm4 18a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h28a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3H18Z"
      />
    </svg>
  );
}

const REVEAL_LEFT = 92;
const REVEAL_RIGHT = 92;
const OPEN_THRESHOLD = 45;
const MOVE_TOLERANCE = 10;

function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
  anyActive: boolean;
  subs: Subtask[];
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    task: t, remainingForThis, liveLogged, overCap, anyActive, subs, openSwipeId, setOpenSwipeId,
    onComplete, onStart, onStop, onOpenDetail, onDelete,
  } = props;

  const [dragX, setDragX] = useState(0);
  const [isOpen, setIsOpen] = useState<'none' | 'left' | 'right'>('none');
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef({ x: 0, y: 0 });
  const axisRef = useRef<{ v: 'none' | 'x' }>({ v: 'none' });

  useEffect(() => {
    if (openSwipeId !== t.id && isOpen !== 'none') {
      setIsOpen('none');
      setDragX(0);
    }
  }, [openSwipeId]);

  const startDisabled = anyActive && t.status !== 'active';

  function handlePointerDown(e: React.PointerEvent) {
    startXRef.current.x = e.clientX;
    startXRef.current.y = e.clientY;
    axisRef.current.v = 'none';
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const dx = e.clientX - startXRef.current.x;
    const dy = e.clientY - startXRef.current.y;
    // Only ever claim the gesture for horizontal swipe. Vertical movement
    // is left alone entirely so the browser's native scroll (touch-action:
    // pan-y) handles it — and so its native tap-vs-scroll detection can
    // correctly drive the click event below, instead of us re-guessing it.
    if (axisRef.current.v === 'none' && Math.abs(dx) > MOVE_TOLERANCE && Math.abs(dx) > Math.abs(dy)) {
      axisRef.current.v = 'x';
    }
    if (axisRef.current.v === 'x') {
      const base = isOpen === 'left' ? -REVEAL_LEFT : isOpen === 'right' ? REVEAL_RIGHT : 0;
      const next = Math.max(Math.min(base + dx, REVEAL_RIGHT), -REVEAL_LEFT);
      setDragX(next);
    }
  }

  function handlePointerUp() {
    setDragging(false);
    if (axisRef.current.v !== 'x') {
      // No horizontal drag happened — leave it to the click event to
      // decide whether this was a tap (open) or a scroll (nothing).
      return;
    }
    if (dragX <= -OPEN_THRESHOLD) {
      setIsOpen('left');
      setDragX(-REVEAL_LEFT);
      setOpenSwipeId(t.id);
    } else if (dragX >= OPEN_THRESHOLD) {
      setIsOpen('right');
      setDragX(REVEAL_RIGHT);
      setOpenSwipeId(t.id);
    } else {
      setDragX(0);
      setIsOpen('none');
      if (openSwipeId === t.id) setOpenSwipeId(null);
    }
  }

  function handlePointerCancel() {
    setDragging(false);
    if (axisRef.current.v === 'x') {
      setDragX(0);
      setIsOpen('none');
      if (openSwipeId === t.id) setOpenSwipeId(null);
    }
  }

  function handleForegroundClick() {
    // A click immediately following a horizontal drag is suppressed by the
    // browser in practice, but guard anyway in case it still fires.
    if (axisRef.current.v === 'x') return;
    if (isOpen !== 'none') {
      setIsOpen('none');
      setDragX(0);
      if (openSwipeId === t.id) setOpenSwipeId(null);
      return;
    }
    onOpenDetail(t.id);
  }

  function closeAnd(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
      setDragX(0);
      setIsOpen('none');
      if (openSwipeId === t.id) setOpenSwipeId(null);
    };
  }

  const rowClass = ['task-row', t.source === 'came_up' ? 'came-up' : '', overCap ? 'over-cap' : ''].join(' ').trim();

  return (
    <div className={rowClass}>
      <div className="swipe-zone">
        <div className="swipe-reveal-left">
          <button className="swipe-reveal-btn edit-btn" onPointerUp={closeAnd(() => onOpenDetail(t.id))} aria-label="Open task">
            <EditIcon />
          </button>
          <button className="swipe-reveal-btn delete-btn" onPointerUp={closeAnd(() => onDelete(t.id))} aria-label="Delete task">
            <DeleteIcon />
          </button>
        </div>
        <button
          className="swipe-reveal-right"
          onPointerUp={closeAnd(() => {
            if (t.status === 'active') onStop(t.id);
            else if (!startDisabled) onStart(t.id);
          })}
          disabled={startDisabled && t.status !== 'active'}
          aria-label={t.status === 'active' ? 'Stop task' : 'Start task'}
          style={{
            border: 'none',
            background: t.status === 'active' ? 'var(--hazard)' : 'var(--steel)',
            opacity: startDisabled && t.status !== 'active' ? 0.4 : 1,
          }}
        >
          {t.status === 'active' ? <StopIcon /> : <PlayIcon />}
          <span>{t.status === 'active' ? 'stop' : 'start'}</span>
        </button>
        <div
          id={`task-${t.id}`}
          tabIndex={-1}
          className="swipe-foreground"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleForegroundClick}
          style={{ transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : 'transform 0.3s var(--spring)', outline: 'none' }}
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
            <div className="task-body">
              <div className="task-text">{t.text}</div>
              <div className="task-progress-row">
                <div className="task-progress-track">
                  <div
                    className="task-progress-fill"
                    style={{ width: `${Math.min((1 - remainingForThis / Math.max(t.estimate_mins, 1)) * 100, 100)}%` }}
                  />
                </div>
                <span className="task-progress-label mono">{fmtMins(remainingForThis)}</span>
              </div>
              {(t.status === 'active' || subs.length > 0 || t.due_today) && (
                <div className="task-tags">
                  {t.status === 'active' && <span className="tag tag-elapsed mono">elapsed {fmtMins(liveLogged)}</span>}
                  {subs.length > 0 && <span className="tag">{subs.filter((s) => s.done).length}/{subs.length} sub-tasks</span>}
                  {t.due_today && <span className="tag tag-due">due today</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskDetailPanel(props: {
  task: Task;
  subs: Subtask[];
  onClose: () => void;
  onUpdateTask: (id: string, fields: Partial<Task>) => void;
  onDelete: (id: string) => void;
  subDraftText: string;
  subDraftTime: string;
  setSubDraftText: (id: string, v: string) => void;
  setSubDraftTime: (id: string, v: string) => void;
  onAddSubtask: (id: string) => void;
  onToggleSubtaskDone: (subId: string, taskId: string, current: boolean) => void;
  onDeleteSubtask: (subId: string, taskId: string) => void;
}) {
  const {
    task: t, subs, onClose, onUpdateTask, onDelete, subDraftText, subDraftTime,
    setSubDraftText, setSubDraftTime, onAddSubtask, onToggleSubtaskDone, onDeleteSubtask,
  } = props;

  const [titleDraft, setTitleDraft] = useState(t.text);
  const [timeDraft, setTimeDraft] = useState(fmtMins(t.estimate_mins));
  const [timeError, setTimeError] = useState('');
  const [notesDraft, setNotesDraft] = useState(t.notes || '');
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const startYRef = useRef(0);
  const titleSaveTimer = useRef<{ id: any }>({ id: null });
  const notesSaveTimer = useRef<{ id: any }>({ id: null });

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function saveTitle(value: string) {
    const text = value.trim();
    if (text.length === 0) return;
    onUpdateTask(t.id, { text });
  }

  function handleTitleChange(v: string) {
    setTitleDraft(v);
    clearTimeout(titleSaveTimer.current.id);
    titleSaveTimer.current.id = setTimeout(() => saveTitle(v), 600);
  }

  function commitTime(v: string) {
    const mins = parseMins(v);
    if (mins === null || mins <= 0) {
      setTimeError('Could not read that time, try 15m or 1.5h');
      return;
    }
    setTimeError('');
    onUpdateTask(t.id, { estimate_mins: mins });
  }

  function handleNotesChange(v: string) {
    setNotesDraft(v);
    clearTimeout(notesSaveTimer.current.id);
    notesSaveTimer.current.id = setTimeout(() => onUpdateTask(t.id, { notes: v }), 600);
  }

  function flushAndClose() {
    clearTimeout(titleSaveTimer.current.id);
    clearTimeout(notesSaveTimer.current.id);
    saveTitle(titleDraft);
    onUpdateTask(t.id, { notes: notesDraft });
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') flushAndClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function handleGrabberDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    setDragging(true);
  }
  function handleGrabberMove(e: React.PointerEvent) {
    const dy = Math.max(e.clientY - startYRef.current, 0);
    setDragY(dy);
  }
  function handleGrabberUp() {
    setDragging(false);
    if (dragY > 100) {
      flushAndClose();
    } else {
      setDragY(0);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={flushAndClose} />
      <div
        className="detail-sheet"
        role="dialog"
        aria-modal="true"
        style={{ transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform 0.22s var(--spring)' }}
      >
        <div
          className="sheet-grabber"
          onPointerDown={handleGrabberDown}
          onPointerMove={dragging ? handleGrabberMove : undefined}
          onPointerUp={handleGrabberUp}
          onPointerCancel={handleGrabberUp}
        >
          <div className="sheet-grabber-bar" />
        </div>

        <textarea
          ref={titleRef}
          className="detail-title-input"
          value={titleDraft}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={() => saveTitle(titleDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          rows={1}
        />

        <div className="detail-row">
          <span className="detail-label">Due today</span>
        </div>
        <div className="segmented" style={{ maxWidth: 240, marginBottom: 'var(--space-4)' }}>
          <button
            className={!t.due_today ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => onUpdateTask(t.id, { due_today: false })}
          >
            Not today
          </button>
          <button
            className={t.due_today ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => onUpdateTask(t.id, { due_today: true })}
          >
            Due today
          </button>
        </div>

        <div className="detail-row">
          <span className="detail-label">Estimate</span>
          <input
            type="text"
            className="detail-time-input mono"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={() => commitTime(timeDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        {timeError && <p className="detail-error">{timeError}</p>}

        <textarea
          className="detail-notes-input"
          placeholder="Notes"
          value={notesDraft}
          onChange={(e) => handleNotesChange(e.target.value)}
          onBlur={() => onUpdateTask(t.id, { notes: notesDraft })}
          rows={3}
        />

        <div className="detail-section">
          <span className="detail-label">Sub-tasks</span>
          <div className="subtask-panel" style={{ borderTop: 'none', paddingTop: 0, marginTop: 'var(--space-2)' }}>
            {subs.map((s) => (
              <div key={s.id} className="subtask-row">
                <button
                  className={s.done ? 'subtask-check done' : 'subtask-check'}
                  onClick={() => onToggleSubtaskDone(s.id, t.id, s.done)}
                  aria-label="Complete sub-task"
                />
                <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
                <span className="tag mono">{fmtMins(s.mins)}</span>
                <button className="icon-btn" onClick={() => onDeleteSubtask(s.id, t.id)} aria-label="Delete sub-task">×</button>
              </div>
            ))}
            <div className="subtask-add-row">
              <input
                type="text"
                placeholder="Sub-task"
                value={subDraftText}
                onChange={(e) => setSubDraftText(t.id, e.target.value)}
              />
              <input
                type="text"
                placeholder="15m"
                style={{ width: 60 }}
                value={subDraftTime}
                onChange={(e) => setSubDraftTime(t.id, e.target.value)}
              />
              <button className="btn btn-ghost" style={{ padding: '4px 10px', minHeight: 32, fontSize: 12 }} onClick={() => onAddSubtask(t.id)}>add</button>
            </div>
          </div>
        </div>

        <div className="detail-section detail-future">
          <span className="detail-label">Waiting on</span>
          <div className="detail-future-placeholder">Not tracked yet</div>
        </div>
        <div className="detail-section detail-future">
          <span className="detail-label">Scheduled for</span>
          <div className="detail-future-placeholder">Not scheduled</div>
        </div>

        <button className="btn-text detail-delete" onClick={() => { onDelete(t.id); onClose(); }}>
          Delete task
        </button>
      </div>
    </>
  );
}

const ONBOARDING_STEPS = ['welcome', 'hours', 'notifications', 'ready'] as const;
type OnboardingStep = typeof ONBOARDING_STEPS[number];

function OnboardingFlow(props: {
  userId: string;
  onComplete: (fields: { work_start: string; work_end: string; notification_style: 'default' | 'silent' }) => void;
}) {
  const { userId, onComplete } = props;
  const [stepIndex, setStepIndex] = useState(0);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [notificationStyle, setNotificationStyle] = useState<'default' | 'silent'>('default');
  const [saving, setSaving] = useState(false);

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex];

  function next() {
    if (stepIndex < ONBOARDING_STEPS.length - 1) setStepIndex(stepIndex + 1);
  }
  function back() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  async function finish() {
    setSaving(true);
    await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        work_start: workStart,
        work_end: workEnd,
        notification_style: notificationStyle,
        onboarding_complete: true,
      },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    onComplete({ work_start: workStart, work_end: workEnd, notification_style: notificationStyle });
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-dots">
        {ONBOARDING_STEPS.map((s, i) => (
          <span
            key={s}
            className={i === stepIndex ? 'onboarding-dot active' : i < stepIndex ? 'onboarding-dot done' : 'onboarding-dot'}
          />
        ))}
      </div>

      {step === 'welcome' && (
        <div className="onboarding-step">
          <DokkitMark size={56} />
          <h1 className="onboarding-title">Welcome to Dokkit</h1>
          <p className="onboarding-body">
            A digital sticky note that understands time. Two quick things and you're set.
          </p>
        </div>
      )}

      {step === 'hours' && (
        <div className="onboarding-step">
          <h1 className="onboarding-title">When's your work day?</h1>
          <p className="onboarding-body">
            Dokkit uses this to show what actually fits before you're done for the day — not an idealized 8 hours.
          </p>
          <div className="onboarding-time-row">
            <div className="onboarding-time-field">
              <span className="detail-label">Starts</span>
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            </div>
            <div className="onboarding-time-field">
              <span className="detail-label">Ends</span>
              <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 'notifications' && (
        <div className="onboarding-step">
          <h1 className="onboarding-title">Nudges, not noise</h1>
          <p className="onboarding-body">
            Dokkit only reaches out to reconnect you with something you captured — never to guilt you about it.
          </p>
          <div className="segmented" style={{ marginTop: 'var(--space-4)', maxWidth: 220 }}>
            <button
              className={notificationStyle === 'default' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => setNotificationStyle('default')}
            >
              Default
            </button>
            <button
              className={notificationStyle === 'silent' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => setNotificationStyle('silent')}
            >
              Silent
            </button>
          </div>
        </div>
      )}

      {step === 'ready' && (
        <div className="onboarding-step">
          <DokkitMark size={56} />
          <h1 className="onboarding-title">You're set</h1>
          <p className="onboarding-body">
            Tap the + to capture the first thing on your mind. Everything else can wait.
          </p>
        </div>
      )}

      <div className="onboarding-nav">
        {stepIndex > 0 ? (
          <button className="btn-text" onClick={back} disabled={saving}>Back</button>
        ) : (
          <span />
        )}
        {step === 'ready' ? (
          <button className="btn btn-steel" onClick={finish} disabled={saving}>
            {saving ? 'Setting up…' : 'Start using Dokkit'}
          </button>
        ) : (
          <button className="btn btn-steel" onClick={next}>Continue</button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [captureOpen, setCaptureOpen] = useState(false);

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskSource, setTaskSource] = useState<'planned' | 'came_up'>('planned');
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

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
    if (session) {
      setCheckingOnboarding(true);
      loadEverything();
    }
  }, [session]);

  async function loadEverything() {
    const userId = session.user.id;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, onboarding_complete')
      .eq('user_id', userId)
      .maybeSingle();

    if (settings && settings.onboarding_complete) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setNeedsOnboarding(false);
    } else {
      setNeedsOnboarding(true);
    }
    setCheckingOnboarding(false);

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
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      if (error.message.toLowerCase().includes('rate limit')) {
        setSignInError('Too many sign-in attempts — please wait a bit and try again.');
      } else {
        setSignInError('This app is private — that email is not recognized.');
      }
      return;
    }
    setMagicLinkSent(true);
  }

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
    const { data } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        text,
        estimate_mins: mins || 15,
        source: taskSource,
        order_index: maxOrder + 1,
      })
      .select()
      .single();
    if (data) setTasks((prev) => [...prev, data]);
    setTaskText('');
    setTaskTime('');
    setCaptureOpen(false);
  }

  async function startTask(id: string) {
    const alreadyActive = tasks.find((t) => t.status === 'active');
    if (alreadyActive) return;
    const startedAt = new Date().toISOString();
    await supabase.from('tasks').update({ status: 'active', started_at: startedAt, near_notified: false, over_notified: false }).eq('id', id);
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
  }

  async function deleteTask(id: string) {
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function openDetail(taskId: string) {
    setOpenTaskId(taskId);
  }

  function closeDetail() {
    const id = openTaskId;
    setOpenTaskId(null);
    if (id) {
      requestAnimationFrame(() => {
        document.getElementById(`task-${id}`)?.focus();
      });
    }
  }

  async function updateTask(id: string, fields: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    await supabase.from('tasks').update(fields).eq('id', id);
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

  if (!session) {
    return (
      <div className="sign-in-shell">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <DokkitMark size={48} />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Dokkit</span>
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 20 }}>Sign in</h1>
        {magicLinkSent ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ padding: 12, borderRadius: 8, border: '1px solid var(--line-strong)', fontSize: 15 }}
            />
            <button type="submit" className="btn btn-steel">Send magic link</button>
            {signInError && <p style={{ color: 'var(--hazard)', fontSize: 13, margin: 0 }}>{signInError}</p>}
          </form>
        )}
      </div>
    );
  }

  if (checkingOnboarding) {
    return <div className="app-shell" />;
  }

  if (needsOnboarding) {
    return (
      <OnboardingFlow
        userId={session.user.id}
        onComplete={({ work_start, work_end }) => {
          setWorkStart(work_start);
          setWorkEnd(work_end);
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  const ordered = [...tasks].sort((a, b) => {
    const aKey = a.due_today ? 0 : 1;
    const bKey = b.due_today ? 0 : 1;
    if (aKey !== bKey) return aKey - bKey;
    return a.order_index - b.order_index;
  });

  function completedSubtaskMins(taskId: string): number {
    return (subtasksByTask[taskId] || []).filter((s) => s.done).reduce((sum, s) => sum + s.mins, 0);
  }

  function remainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
  }

  const meetingMins = meetings.reduce((sum, m) => sum + m.duration_mins, 0);
  const remainingTaskMins = ordered.reduce((sum, t) => sum + remainingForTask(t), 0);
  const remainingWorkMins = meetingMins + remainingTaskMins;

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = Math.max(workEndMinutes - nowMinutesOfDay, 0);

  const overloaded = remainingWorkMins > minutesLeftToday;

  let cumulative = 0;
  const taskCapacity = minutesLeftToday - meetingMins;

  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1 className="app-title">Today</h1>
        <div className="app-date">{dateLabel}</div>
      </div>

      <div className="perforation" />
      <div className={overloaded ? 'capacity-card overloaded' : 'capacity-card'}>
        <div className="capacity-row">
          <div className="capacity-ring-wrap">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="25" fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke={overloaded ? 'var(--hazard)' : 'var(--steel)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 25}
                strokeDashoffset={2 * Math.PI * 25 * (1 - Math.min(remainingWorkMins / Math.max(minutesLeftToday, 1), 1))}
                style={{ transition: 'stroke-dashoffset 0.5s var(--ease), stroke 0.3s var(--ease)' }}
              />
            </svg>
          </div>
          <div className="capacity-number-block">
            <div className="capacity-hero-number mono">{fmtMins(minutesLeftToday)}</div>
            <div className="capacity-hero-label">left today · {fmtMins(remainingWorkMins)} planned</div>
            {overloaded && (
              <div className="capacity-warn-line">{fmtMins(remainingWorkMins - minutesLeftToday)} more than time left</div>
            )}
          </div>
        </div>
      </div>


      <Link href="/preferences" className="settings-toggle" style={{ textDecoration: 'none', display: 'inline-block' }}>
        ⚙ Preferences
      </Link>

      <div className="task-list">
        {ordered.length === 0 && (
          <div className="empty-state">Nothing on your plate yet.<br />Tap + to add something.</div>
        )}
        {ordered.map((t) => {
          const remainingForThis = remainingForTask(t);
          cumulative += remainingForThis;
          const overCap = cumulative > taskCapacity;
          const anyActive = tasks.some((x) => x.status === 'active');
          const subs = subtasksByTask[t.id] || [];
          let liveLogged = t.logged_mins;
          if (t.status === 'active' && t.started_at) {
            liveLogged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
          }
          return (
            <TaskCard
              key={t.id}
              task={t}
              remainingForThis={remainingForThis}
              liveLogged={liveLogged}
              overCap={overCap}
              anyActive={anyActive}
              subs={subs}
              openSwipeId={openSwipeId}
              setOpenSwipeId={setOpenSwipeId}
              onComplete={completeTask}
              onStart={startTask}
              onStop={stopTask}
              onOpenDetail={openDetail}
              onDelete={deleteTask}
            />
          );
        })}
      </div>

      {openTaskId && tasks.find((t) => t.id === openTaskId) && (
        <TaskDetailPanel
          task={tasks.find((t) => t.id === openTaskId) as Task}
          subs={subtasksByTask[openTaskId] || []}
          onClose={closeDetail}
          onUpdateTask={updateTask}
          onDelete={deleteTask}
          subDraftText={subDraftText[openTaskId] || ''}
          subDraftTime={subDraftTime[openTaskId] || ''}
          setSubDraftText={(id, v) => setSubDraftText((prev) => ({ ...prev, [id]: v }))}
          setSubDraftTime={(id, v) => setSubDraftTime((prev) => ({ ...prev, [id]: v }))}
          onAddSubtask={addSubtask}
          onToggleSubtaskDone={toggleSubtaskDone}
          onDeleteSubtask={deleteSubtask}
        />
      )}

      {captureOpen && (
        <div className="capture-sheet">
          <input
            type="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
          <div className="segmented">
            <button
              className={taskSource === 'planned' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => setTaskSource('planned')}
            >
              planned
            </button>
            <button
              className={taskSource === 'came_up' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => setTaskSource('came_up')}
            >
              came up
            </button>
          </div>
          <div className="capture-row">
            <input
              type="text"
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              placeholder="15m"
              style={{ width: 80 }}
            />
            <button className="btn btn-steel" style={{ flex: 1 }} onClick={addTask}>Add task</button>
          </div>
          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          <button className="btn-text" onClick={() => setCaptureOpen(false)}>Cancel</button>
        </div>
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Dock it">+</button>
      )}
    </div>
  );
}
