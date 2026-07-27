'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

const DAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
  { label: 'S', value: 0 },
];

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

export default function Preferences() {
  const [session, setSession] = useState<any>(null);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notificationStyle, setNotificationStyle] = useState<'default' | 'silent'>('default');
  const [notifStatus, setNotifStatus] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const [calendarConnection, setCalendarConnection] = useState<{ connected_email: string | null } | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) {
      loadSettings();
      loadCalendarConnection();
    }
  }, [session]);

  // Pick up the ?calendar=connected / ?calendar=error redirect from the
  // OAuth callback and clean the URL so a refresh doesn't re-show it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      setCalendarMessage('Calendar connected — the first sync runs within a few minutes.');
    } else if (params.get('calendar') === 'error') {
      setCalendarMessage('Could not connect your calendar. Please try again.');
    }
    if (params.get('calendar')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function loadSettings() {
    const userId = session.user.id;
    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, work_days, notification_style')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setWorkDays(settings.work_days && settings.work_days.length > 0 ? settings.work_days : [1, 2, 3, 4, 5]);
      setNotificationStyle(settings.notification_style || 'default');
    }
  }

  async function loadCalendarConnection() {
    const { data } = await supabase
      .from('calendar_connections')
      .select('connected_email')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setCalendarConnection(data || null);
  }

  async function disconnectCalendar() {
    setDisconnecting(true);
    await fetch('/api/auth/microsoft/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    setCalendarConnection(null);
    setCalendarMessage('Calendar disconnected.');
    setDisconnecting(false);
  }

  function toggleDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function saveWorkHours() {
    await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd, work_days: workDays })
      .eq('user_id', session.user.id);
    setSavedMsg('Work hours saved.');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  async function saveNotificationStyle(style: 'default' | 'silent') {
    setNotificationStyle(style);
    await supabase.from('user_settings').update({ notification_style: style }).eq('user_id', session.user.id);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subscription }),
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setNotifStatus(res.ok ? 'Sent — check your phone.' : 'Failed: ' + (data.error || 'unknown error'));
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Preferences" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Preferences" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Work hours</div>
        <div className="settings-row">
          <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
          <span>to</span>
          <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
        </div>

        <span className="settings-label">Work days</span>
        <div className="day-toggle-row">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d.value}
              className={workDays.includes(d.value) ? 'day-toggle-btn active' : 'day-toggle-btn'}
              onClick={() => toggleDay(d.value)}
              aria-label={d.label}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="settings-row">
          <button className="btn btn-ghost" onClick={saveWorkHours}>Save</button>
          {savedMsg && <span className="settings-saved">{savedMsg}</span>}
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Calendar</div>
        {calendarMessage && <div className="settings-status">{calendarMessage}</div>}
        {calendarConnection ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
              Connected{calendarConnection.connected_email ? ` as ${calendarConnection.connected_email}` : ''}.
              Today's meetings are pulled in automatically and drop off your workload once they end —
              nothing to schedule or manage.
            </p>
            <button className="btn btn-ghost" onClick={disconnectCalendar} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect calendar'}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
              Outlook calendar sync is being finalized — Microsoft requires apps like this to go
              through an app verification process before it can connect reliably. This will open up
              in a future update.
            </p>
            <button className="btn btn-ghost" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              Connect Outlook Calendar — coming soon
            </button>
          </>
        )}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Notifications</div>
        <div className="settings-row">
          <button className="btn btn-ghost" onClick={enableNotifications}>Enable notifications</button>
          <button className="btn btn-ghost" onClick={sendTestNotification}>Send test</button>
        </div>
        <div className="settings-row">
          <span className="settings-label">Style</span>
          <div className="segmented" style={{ maxWidth: 160 }}>
            <button
              className={notificationStyle === 'default' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => saveNotificationStyle('default')}
            >
              Default
            </button>
            <button
              className={notificationStyle === 'silent' ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => saveNotificationStyle('silent')}
            >
              Silent
            </button>
          </div>
        </div>
        {notifStatus && <div className="settings-status">{notifStatus}</div>}
      </div>
    </div>
  );
}
