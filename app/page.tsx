'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Task = {
  id: string;
  text: string;
  status: 'pending' | 'active' | 'done';
  source: 'planned' | 'came_up';
  estimate_mins: number;
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

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [dayLengthMins, setDayLengthMins] = useState(480);

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskSource, setTaskSource] = useState<'planned' | 'came_up'>('planned');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadEverything();
  }, [session]);

  async function loadEverything() {
    const userId = session.user.id;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('day_length_mins')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setDayLengthMins(settings.day_length_mins);
    } else {
      await supabase.from('user_settings').insert({ user_id: userId, day_length_mins: 480 });
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

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email });
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
  }

  async function toggleDueToday(id: string, current: boolean) {
    await supabase.from('tasks').update({ due_today: !current }).eq('id', id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today: !current } : t)));
  }

  async function completeTask(id: string) {
    await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
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
  const taskMins = ordered.reduce((sum, t) => sum + t.estimate_mins, 0);
  const combined = meetingMins + taskMins;
  const over = combined > dayLengthMins;
  const taskCapacity = dayLengthMins - meetingMins;

  let cumulative = 0;

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Today</h1>

      <div style={{ background: '#f4f4f4', borderRadius: 8, padding: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
          {fmtMins(meetingMins)} meetings + {fmtMins(taskMins)} tasks = {fmtMins(combined)} / {fmtMins(dayLengthMins)}
        </div>
        <div style={{ height: 8, borderRadius: 4, background: '#e0e0e0', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${Math.min((meetingMins / Math.max(combined, dayLengthMins)) * 100, 100)}%`, background: '#999' }} />
          <div
            style={{
              width: `${Math.min((taskMins / Math.max(combined, dayLengthMins)) * 100, 100)}%`,
              background: over ? '#d9534f' : combined / dayLengthMins > 0.8 ? '#e8a33d' : '#4a90d9',
            }}
          />
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
          cumulative += t.estimate_mins;
          const overCap = cumulative > taskCapacity;
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid #eee', opacity: overCap ? 0.55 : 1 }}>
              <button onClick={() => completeTask(t.id)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #999', background: 'none', cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{t.text}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#eee' }}>{fmtMins(t.estimate_mins)}</span>
                  {t.due_today && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#fbdcd9', color: '#a33' }}>due today</span>}
                  {overCap && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#f5d6b8', color: '#a06' }}>no room today</span>}
                </div>
              </div>
              <button onClick={() => toggleDueToday(t.id, t.due_today)} style={{ fontSize: 12, padding: '4px 8px', color: t.due_today ? '#a33' : '#999', background: 'none', border: 'none', cursor: 'pointer' }}>due</button>
              <button onClick={() => deleteTask(t.id)} style={{ fontSize: 14, background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

