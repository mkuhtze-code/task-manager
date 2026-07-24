'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

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

const HAS_SIGNED_IN_KEY = 'dokkit-has-signed-in';

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

const REVEAL_LEFT = 92;
const TRIGGER_RIGHT = 90;
const OPEN_THRESHOLD = 45;
const TRIGGER_THRESHOLD = 60;
const MOVE_TOLERANCE = 6;
const LONG_PRESS_MS = 500;

function TaskCard(props: {
  task: Task;
  remainingForThis: number;
  liveLogged: number;
  overCap: boolean;
  anyActive: boolean;
  subs: Subtask[];
  expanded: boolean;
  editing: boolean;
  editText: string;
  editTime: string;
  editError: string;
  subDraftText: string;
  subDraftTime: string;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onStartEdit: (t: Task) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleDue: (id: string, current: boolean) => void;
  onToggleExpand: (id: string) => void;
  setEditText: (v: string) => void;
  setEditTime: (v: string) => void;
  setSubDraftText: (id: string, v: string) => void;
  setSubDraftTime: (id: string, v: string) => void;
  onAddSubtask: (id: string) => void;
  onToggleSubtaskDone: (subId: string, taskId: string, current: boolean) => void;
  onDeleteSubtask: (subId: string, taskId: string) => void;
}) {
  const {
    task: t, remainingForThis, liveLogged, overCap, anyActive, subs, expanded, editing,
    editText, editTime, editError, subDraftText, subDraftTime, openSwipeId, setOpenSwipeId,
    onComplete, onStart, onStop, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onToggleDue,
    onToggleExpand, setEditText, setEditTime, setSubDraftText, setSubDraftTime, onAddSubtask,
    onToggleSubtaskDone, onDeleteSubtask,
  } = props;

  const [dragX, setDragX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef({ x: 0, y: 0, t: 0 });
  const movedRef = useRef({ v: false });
  const axisRef = useRef<{ v: 'none' | 'x' | 'y' }>({ v: 'none' });
  const longPressFiredRef = useRef({ v: false });
  const longPressTimer = useRef<{ id: any }>({ id: null });

  useEffect(() => {
    if (openSwipeId !== t.id && isOpen) {
      setIsOpen(false);
      setDragX(0);
    }
  }, [openSwipeId]);

  const startDisabled = anyActive && t.status !== 'active';

  function handlePointerDown(e: React.PointerEvent) {
    startXRef.current.x = e.clientX;
    startXRef.current.y = e.clientY;
    startXRef.current.t = Date.now();
    movedRef.current.v = false;
    axisRef.current.v = 'none';
    longPressFiredRef.current.v = false;
    setDragging(true);
    longPressTimer.current.id = setTimeout(() => {
      if (!movedRef.current.v) {
        longPressFiredRef.current.v = true;
        onToggleDue(t.id, t.due_today);
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const dx = e.clientX - startXRef.current.x;
    const dy = e.clientY - startXRef.current.y;
    if (axisRef.current.v === 'none') {
      if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) {
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
      const base = isOpen ? -REVEAL_LEFT : 0;
      const next = Math.max(Math.min(base + dx, TRIGGER_RIGHT), -REVEAL_LEFT);
      setDragX(next);
    }
  }

  function handlePointerUp() {
    clearTimeout(longPressTimer.current.id);
    setDragging(false);
    if (longPressFiredRef.current.v) {
      setDragX(isOpen ? -REVEAL_LEFT : 0);
      return;
    }
    if (axisRef.current.v !== 'x') {
      if (!movedRef.current.v) {
        if (isOpen) {
          setIsOpen(false);
          setDragX(0);
          if (openSwipeId === t.id) setOpenSwipeId(null);
        } else {
          onToggleExpand(t.id);
        }
      }
      return;
    }
    if (dragX <= -OPEN_THRESHOLD) {
      setIsOpen(true);
      setDragX(-REVEAL_LEFT);
      setOpenSwipeId(t.id);
    } else if (dragX >= TRIGGER_THRESHOLD) {
      if (t.status === 'active') onStop(t.id);
      else if (!startDisabled) onStart(t.id);
      setDragX(0);
      setIsOpen(false);
    } else {
      setDragX(0);
      setIsOpen(false);
      if (openSwipeId === t.id) setOpenSwipeId(null);
    }
  }

  function closeAnd(action: () => void) {
    return (e: React.PointerEvent | React.MouseEvent) => {
      e.stopPropagation();
      action();
      setDragX(0);
      setIsOpen(false);
      if (openSwipeId === t.id) setOpenSwipeId(null);
    };
  }

  const rowClass = ['task-row', t.source === 'came_up' ? 'came-up' : '', overCap ? 'over-cap' : ''].join(' ').trim();

  return (
    <div className={rowClass}>
      {editing ? (
        <div className="edit-surface" style={{ padding: 'var(--space-3) var(--space-4)', position: 'relative', zIndex: 2, background: 'var(--paper-raised)' }}>
          <div className="edit-form">
            <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
            <div className="capture-row">
              <input type="text" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ width: 70 }} />
              <button className="btn btn-steel" style={{ flex: 1 }} onClick={() => onSaveEdit(t.id)}>Save</button>
              <button className="btn btn-ghost" onClick={onCancelEdit}>Cancel</button>
            </div>
            {editError && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{editError}</p>}
          </div>
        </div>
      ) : (
        <div className="swipe-zone">
          <div className="swipe-reveal-left">
            <button className="swipe-reveal-btn edit-btn" onPointerUp={closeAnd(() => onStartEdit(t))} aria-label="Edit task">
              <EditIcon />
            </button>
            <button className="swipe-reveal-btn delete-btn" onPointerUp={closeAnd(() => onDelete(t.id))} aria-label="Delete task">
              <DeleteIcon />
            </button>
          </div>
          <div className="swipe-reveal-right" style={{ background: t.status === 'active' ? 'var(--hazard)' : 'var(--steel)', opacity: startDisabled && t.status !== 'active' ? 0.4 : 1 }}>
            {t.status === 'active' ? <StopIcon /> : <PlayIcon />}
            <span>{t.status === 'active' ? 'stop' : 'start'}</span>
          </div>
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
                onClick={() => onComplete(t.id)}
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
      )}

      {!editing && expanded && (
        <div style={{ position: 'relative', zIndex: 2, background: overCap ? 'var(--overflow-bg)' : 'var(--paper-raised)', padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="subtask-panel">
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
      )}
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [hasSignedInBefore, setHasSignedInBefore] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editError, setEditError] = useState('');

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
      .select('work_start, work_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
    } else {
      await supabase.from('user_settings').insert({ user_id: userId, work_start: '08:00', work_end: '16:00' });
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
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      setSignInError('This app is private — that email is not recognized.');
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

  async function toggleDueToday(id: string, current: boolean) {
    await supabase.from('tasks').update({ due_today: !current }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today: !current } : t)));
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

  function toggleExpand(taskId: string) {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  function startEdit(t: Task) {
    setEditingTaskId(t.id);
    setEditText(t.text);
    setEditTime(fmtMins(t.estimate_mins));
    setEditError('');
  }

  function cancelEdit() {
    setEditingTaskId(null);
    setEditError('');
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (text.length === 0) {
      setEditError('Name cannot be empty');
      return;
    }
    const mins = parseMins(editTime);
    if (mins === null || mins <= 0) {
      setEditError('Could not read that time, try 15m or 1.5h');
      return;
    }
    await supabase.from('tasks').update({ text, estimate_mins: mins }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text, estimate_mins: mins } : t)));
    setEditingTaskId(null);
    setEditError('');
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
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-eyebrow">Dokkit</div>
          {hasSignedInBefore ? (
            <>
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-sub">Sign back in to pick up where you left off.</p>
            </>
          ) : (
            <>
              <h1 className="auth-title">Set up Dokkit</h1>
              <p className="auth-sub">
                A personal thinking tool that understands time. Enter your email to get started.
              </p>
            </>
          )}
          {magicLinkSent ? (
            <p className="auth-sent">Check your email for a sign-in link.</p>
          ) : (
            <form onSubmit={signIn} className="auth-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
              <button type="submit" className="btn btn-steel">Send magic link</button>
              {signInError && <p className="auth-error">{signInError}</p>}
            </form>
          )}
        </div>
      </div>
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
      <AppHeader title="Today" dateLabel={dateLabel} />

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
          const expanded = !!expandedTaskIds[t.id];
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
              expanded={expanded}
              editing={editingTaskId === t.id}
              editText={editText}
              editTime={editTime}
              editError={editError}
              subDraftText={subDraftText[t.id] || ''}
              subDraftTime={subDraftTime[t.id] || ''}
              openSwipeId={openSwipeId}
              setOpenSwipeId={setOpenSwipeId}
              onComplete={completeTask}
              onStart={startTask}
              onStop={stopTask}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onDelete={deleteTask}
              onToggleDue={toggleDueToday}
              onToggleExpand={toggleExpand}
              setEditText={setEditText}
              setEditTime={setEditTime}
              setSubDraftText={(id, v) => setSubDraftText((prev) => ({ ...prev, [id]: v }))}
              setSubDraftTime={(id, v) => setSubDraftTime((prev) => ({ ...prev, [id]: v }))}
              onAddSubtask={addSubtask}
              onToggleSubtaskDone={toggleSubtaskDone}
              onDeleteSubtask={deleteSubtask}
            />
          );
        })}
      </div>

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
