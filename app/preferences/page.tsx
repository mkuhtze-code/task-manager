'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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
  const [notificationStyle, setNotificationStyle] = useState<'default' | 'silent'>('default');
  const [notifStatus, setNotifStatus] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) loadSettings();
  }, [session]);

  async function loadSettings() {
    const userId = session.user.id;
    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, notification_style')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setNotificationStyle(settings.notification_style || 'default');
    }
  }

  async function saveWorkHours() {
    await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd })
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

  if (!session) {
    return (
      <div className="app-shell">
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 40 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1 className="app-title">Preferences</h1>
      </div>

      <Link href="/" className="btn-text" style={{ display: 'inline-block', marginBottom: 20, padding: 0 }}>
        ← Back to today
      </Link>

      <div className="settings-panel" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Work hours</div>
        <div className="settings-row">
          <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
          <span>to</span>
          <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
          <button className="btn btn-ghost" onClick={saveWorkHours}>Save</button>
          {savedMsg && <span style={{ fontSize: 12, color: 'var(--moss)' }}>{savedMsg}</span>}
        </div>
      </div>

      <div className="settings-panel">
        <div style={{ fontSize: 14, fontWeight: 600 }}>Notifications</div>
        <div className="settings-row">
          <button className="btn btn-ghost" onClick={enableNotifications}>Enable notifications</button>
          <button className="btn btn-ghost" onClick={sendTestNotification}>Send test</button>
        </div>
        <div className="settings-row">
          <span>Style</span>
          <button
            className={notificationStyle === 'default' ? 'btn btn-steel' : 'btn btn-ghost'}
            style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }}
            onClick={() => saveNotificationStyle('default')}
          >
            Default
          </button>
          <button
            className={notificationStyle === 'silent' ? 'btn btn-steel' : 'btn btn-ghost'}
            style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }}
            onClick={() => saveNotificationStyle('silent')}
          >
            Silent
          </button>
        </div>
        {notifStatus && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{notifStatus}</div>}
      </div>
    </div>
  );
}

