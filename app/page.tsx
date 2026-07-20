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

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskSource, setTaskSource] = useState<'planned' | 'came_up'>('planned');
  const [error, setError] = useState('');
  const [notifStatus, setNotifStatus] = useState('');
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
  }

  async function toggleDueToday(id: string, current: boolean) {
    await supabase.from('tasks').update({ due_today: !current }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today: !current } : t)));
  }

  async function startTask(id: string) {
    const alreadyActive = tasks.find((t) => t.status === 'active');
    if (alreadyActive) return;
    const startedAt = new Date().toISOString();
    await supabase.from('tasks').update({ status: 'active', started_at: startedAt }).eq('id', id);
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

  if (!session) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Sign in</h1>
        {magicLinkSent ? (
          <p>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={signIn}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
            />
            <button type="submit" style={{ width: '100%', padding: 8 }}>Send magic link</button>
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

  const meetingMins = meetings.reduce((sum, m) => sum + m.duration_mins, 0);

  const remainingTaskMins = ordered.reduce((sum, t) => {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    return sum + Math.max(t.estimate_mins - logged, 0);
  }, 0);

  const remainingWorkMins = meetingMins + remainingTaskMins;

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = Math.max(workEndMinutes - nowMinutesOfDay, 0);

  const overloaded = remainingWorkMins > minutesLeftToday;

  let cumulative = 0;
  const taskCapacity = minutesLeftToday - meetingMins;

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Today</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={enableNotifications} style={{ padding: '6px 10px', fontSize: 13 }}>Enable notifications</button>
        <button onClick={sendTestNotification} style={{ padding: '6px 10px', fontSize: 13 }}>Send test notification</button>
        {notifStatus && <span style={{ fontSize: 12, color: '#666' }}>{notifStatus}</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, fontSize: 13 }}>
        <span>Work hours</span>
        <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={{ padding: 4 }} />
        <span>to</span>
        <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} style={{ padding: 4 }} />
        <button onClick={saveWorkHours} style={{ padding: '4px 8px', fontSize: 12 }}>save</button>
      </div>

      <div style={{ background: overloaded ? '#fbe9e7' : '#f4f4f4', borderRadius: 8, padding: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: overloaded ? '#a33' : '#555' }}>
          It is {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')} — {fmtMins(minutesLeftToday)} left in your work day.
        </div>
        <div style={{ fontSize: 13, color: overloaded ? '#a33' : '#555', marginTop: 4, fontWeight: overloaded ? 600 : 400 }}>
          {fmtMins(remainingWorkMins)} of work remaining ({fmtMins(meetingMins)} meetings + {fmtMins(remainingTaskMins)} tasks)
          {overloaded && ` — ${fmtMins(remainingWorkMins - minutesLeftToday)} more than time left today`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <input
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="What needs doing?"
          style={{ flex: 1, padding: 8 }}
        />
        <input
          value={taskTime}
          onChange={(e) => setTaskTime(e.target.value)}
          placeholder="15m"
          style={{ width: 70, padding: 8 }}
        />
        <button
          onClick={() => setTaskSource(taskSource === 'planned' ? 'came_up' : 'planned')}
          style={{ width: 110, padding: 8 }}
        >
          {taskSource === 'planned' ? 'planned' : 'came up'}
        </button>
        <button onClick={addTask} style={{ width: 44, padding: 8 }}>+</button>
      </div>
      {error && <p style={{ color: '#d9534f', fontSize: 12, marginBottom: 16 }}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        {ordered.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>Nothing on your plate yet.</p>}
        {ordered.map((t) => {
          let liveLogged = t.logged_mins;
          if (t.status === 'active' && t.started_at) {
            liveLogged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
          }
          const remainingForThis = Math.max(t.estimate_mins - liveLogged, 0);
          cumulative += remainingForThis;
          const overCap = cumulative > taskCapacity;
          const anyActive = tasks.some((x) => x.status === 'active');
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid #eee', opacity: overCap ? 0.55 : 1 }}>
              <button onClick={() => completeTask(t.id)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #999', background: 'none', cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{t.text}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#eee' }}>est {fmtMins(t.estimate_mins)}</span>
                  {t.status === 'active' && (
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#dbe9fb', color: '#2a5fa0' }}>
                      elapsed {fmtMins(liveLogged)}
                    </span>
                  )}
                  {t.logged_mins > 0 && t.status !== 'active' && (
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#eee' }}>logged {fmtMins(t.logged_mins)}</span>
                  )}
                  {t.due_today && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#fbdcd9', color: '#a33' }}>due today</span>}
                  {overCap && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#f5d6b8', color: '#a06' }}>no room today</span>}
                </div>
              </div>
              {t.status === 'active' ? (
                <button onClick={() => stopTask(t.id)} style={{ fontSize: 12, padding: '4px 8px' }}>stop</button>
              ) : (
                <button onClick={() => startTask(t.id)} disabled={anyActive} style={{ fontSize: 12, padding: '4px 8px', opacity: anyActive ? 0.4 : 1 }}>start</button>
              )}
              <button onClick={() => toggleDueToday(t.id, t.due_today)} style={{ fontSize: 12, padding: '4px 8px', color: t.due_today ? '#a33' : '#999', background: 'none', border: 'none', cursor: 'pointer' }}>due</button>
              <button onClick={() => deleteTask(t.id)} style={{ fontSize: 14, background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
