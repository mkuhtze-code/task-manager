'use client';

import { useEffect, useState } from 'react';
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <circle cx="13" cy="13" r="11" fill={done ? 'var(--moss)' : 'none'} stroke={done ? 'var(--moss)' : 'var(--line-strong)'} strokeWidth="2" />
      <path
        d="M7.5 13.2 L11 17 L18.5 8.5"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16"
        strokeDashoffset={done ? 0 : 16}
      />
    </svg>
  );
}

function FlagIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path
        d="M3 1.5v13M3 2h8l-2 2.5L11 7H3"
        fill={active ? 'var(--hazard)' : 'none'}
        stroke={active ? 'var(--hazard)' : 'var(--ink-faint)'}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16">
      <path
        d="M11.5 1.5l3 3-8 8-3.5 0.5 0.5-3.5z"
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskSource, setTaskSource] = useState<'planned' | 'came_up'>('planned');
  const [error, setError] = useState('');
  const [notifStatus, setNotifStatus] = useState('');
  const [now, setNow] = useState(new Date());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editError, setEditError] = useState('');

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

  async function saveWorkHours() {
    await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd })
      .eq('user_id', session.user.id);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email });
    setMagicLinkSent(true);
  }

  async function enableNotifications() {
    setNotifStatus('Requesting permission...');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifStatus('Permission was not granted.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string) as BufferSource,
      });
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id, subscription }),
      });
      setNotifStatus('Notifications enabled.');
    } catch (e: any) {
      setNotifStatus('Something went wrong: ' + e.message);
    }
  }

  async function sendTestNotification() {
    setNotifStatus('Sending test notification...');
    const res = await fetch('/api/send-test-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.user.id }),
    });
    const data = await res.json();
    setNotifStatus(res.ok ? 'Sent — check your phone.' : 'Failed: ' + (data.error || 'unknown error'));
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
      <div className="sign-in-shell">
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
          </form>
        )}
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
  const denom = Math.max(remainingWorkMins, minutesLeftToday, 1);

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
        <div className="capacity-top">
          <div>
            <div className="capacity-hero-number mono">{fmtMins(minutesLeftToday)}</div>
            <div className="capacity-hero-label">left in your work day</div>
          </div>
          <div className="capacity-detail">
            <span className="mono">{fmtMins(remainingWorkMins)}</span> of work remaining<br />
            {fmtMins(meetingMins)} meetings + {fmtMins(remainingTaskMins)} tasks
            {overloaded && <><br /><span className="warn-text">{fmtMins(remainingWorkMins - minutesLeftToday)} more than time left</span></>}
          </div>
        </div>
        <div className="capacity-track">
          <div className="capacity-fill-meetings" style={{ width: `${Math.min((meetingMins / denom) * 100, 100)}%` }} />
          <div className={overloaded ? 'capacity-fill-tasks warn' : 'capacity-fill-tasks'} style={{ width: `${Math.min((remainingTaskMins / denom) * 100, 100)}%` }} />
        </div>
      </div>

      <button className="settings-toggle" onClick={() => setSettingsOpen(!settingsOpen)}>
        {settingsOpen ? '▾' : '▸'} Settings
      </button>

      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-row">
            <span>Work hours</span>
            <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            <span>to</span>
            <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            <button className="btn btn-ghost" onClick={saveWorkHours}>Save</button>
          </div>
          <div className="settings-row">
            <button className="btn btn-ghost" onClick={enableNotifications}>Enable notifications</button>
            <button className="btn btn-ghost" onClick={sendTestNotification}>Send test</button>
          </div>
          {notifStatus && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{notifStatus}</div>}
        </div>
      )}

      <div className="task-list">
        {ordered.length === 0 && (
          <div className="empty-state">Nothing on your plate yet.<br />Tap + to add something.</div>
        )}
        {ordered.map((t) => {
          const remainingForThis = remainingForTask(t);
          cumulative += remainingForThis;
          const overCap = cumulative > taskCapacity;
          const anyActive = tasks.some((x) => x.status === 'active');
          const rowClass = ['task-row', t.source === 'came_up' ? 'came-up' : '', overCap ? 'over-cap' : ''].join(' ').trim();
          const subs = subtasksByTask[t.id] || [];
          const expanded = !!expandedTaskIds[t.id];
          let liveLogged = t.logged_mins;
          if (t.status === 'active' && t.started_at) {
            liveLogged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
          }
          return (
            <div key={t.id} className={rowClass}>
              <button className="check-btn" onClick={() => completeTask(t.id)} aria-label="Complete task">
                <CheckIcon done={false} />
              </button>
              <div className="task-body">
                {editingTaskId === t.id ? (
                  <div className="edit-form">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                    <div className="capture-row">
                      <input
                        type="text"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        style={{ width: 70 }}
                      />
                      <button className="btn btn-steel" style={{ flex: 1 }} onClick={() => saveEdit(t.id)}>Save</button>
                      <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
                    </div>
                    {editError && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{editError}</p>}
                  </div>
                ) : (
                  <>
                    <div className="task-text">{t.text}</div>
                    <div className="task-tags">
                      <span className="tag mono">{fmtMins(remainingForThis)} left of {fmtMins(t.estimate_mins)}</span>
                      {t.status === 'active' && <span className="tag tag-elapsed mono">elapsed {fmtMins(liveLogged)}</span>}
                      {subs.length > 0 && <span className="tag">{subs.filter((s) => s.done).length}/{subs.length} sub-tasks</span>}
                      {t.due_today && <span className="tag tag-due">due today</span>}
                      {overCap && <span className="tag tag-warn">no room today</span>}
                    </div>
                  </>
                )}

                {expanded && (
                  <div className="subtask-panel">
                    {subs.map((s) => (
                      <div key={s.id} className="subtask-row">
                        <button
                          className={s.done ? 'subtask-check done' : 'subtask-check'}
                          onClick={() => toggleSubtaskDone(s.id, t.id, s.done)}
                          aria-label="Complete sub-task"
                        />
                        <span className={s.done ? 'subtask-text done' : 'subtask-text'}>{s.text}</span>
                        <span className="tag mono">{fmtMins(s.mins)}</span>
                        <button className="icon-btn" onClick={() => deleteSubtask(s.id, t.id)} aria-label="Delete sub-task">×</button>
                      </div>
                    ))}
                    <div className="subtask-add-row">
                      <input
                        type="text"
                        placeholder="Sub-task"
                        value={subDraftText[t.id] || ''}
                        onChange={(e) => setSubDraftText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="15m"
                        style={{ width: 60 }}
                        value={subDraftTime[t.id] || ''}
                        onChange={(e) => setSubDraftTime((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      />
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', minHeight: 32, fontSize: 12 }} onClick={() => addSubtask(t.id)}>add</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="task-actions">
                {t.status === 'active' ? (
                  <button className="btn btn-steel" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }} onClick={() => stopTask(t.id)}>stop</button>
                ) : (
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }} disabled={anyActive} onClick={() => startTask(t.id)}>start</button>
                )}
                <div className="action-row">
                  <button className="icon-btn" onClick={() => startEdit(t)} aria-label="Edit task">
                    <EditIcon />
                  </button>
                  <button className="expand-btn" onClick={() => toggleExpand(t.id)} aria-label="Show sub-tasks">⋯</button>
                  <button className="icon-btn flag-btn" onClick={() => toggleDueToday(t.id, t.due_today)} aria-label="Mark due today">
                    <FlagIcon active={t.due_today} />
                  </button>
                  <button className="icon-btn" onClick={() => deleteTask(t.id)} aria-label="Delete task">×</button>
                </div>
              </div>
            </div>
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
          <div className="capture-row">
            <input
              type="text"
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              placeholder="15m"
              style={{ width: 80 }}
            />
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => setTaskSource(taskSource === 'planned' ? 'came_up' : 'planned')}
            >
              {taskSource === 'planned' ? 'planned' : 'came up'}
            </button>
            <button className="btn btn-steel" style={{ flex: 1 }} onClick={addTask}>Add task</button>
          </div>
          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          <button className="btn-text" onClick={() => setCaptureOpen(false)}>Cancel</button>
        </div>
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Add task">+</button>
      )}
    </div>
  );
}
