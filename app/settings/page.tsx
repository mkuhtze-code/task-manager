'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import LocationAutocomplete from '@/components/LocationAutocomplete';

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

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" by="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  let resolved: 'light' | 'dark' = theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem('dokkit-theme', theme);
  } catch (e) {}
}

type SortMode = 'capacity_first' | 'due_today_first' | 'manual' | 'oldest_first' | 'newest_first' | 'geo_aware';

const SORT_OPTIONS: { value: SortMode; label: string; desc: string }[] = [
  { value: 'capacity_first', label: 'Fits today first', desc: 'Tasks that fit your remaining time float to the top' },
  { value: 'due_today_first', label: 'Due today first', desc: 'Due-today tasks float to the top' },
  { value: 'geo_aware', label: 'Route-aware', desc: 'Ordered by drive distance from home or work' },
  { value: 'manual', label: 'Manual', desc: 'Drag to arrange exactly how you want' },
  { value: 'oldest_first', label: 'Oldest first', desc: 'By when each task was added' },
  { value: 'newest_first', label: 'Newest first', desc: 'Most recently added on top' },
];

export default function Settings() {
  const [session, setSession] = useState<any>(null);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notificationStyle, setNotificationStyle] = useState<'default' | 'silent'>('default');
  const [notifStatus, setNotifStatus] = useState('');

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      const stored = localStorage.getItem('dokkit-theme') as Theme | null;
      return stored || 'system';
    } catch (e) {
      return 'system';
    }
  });

  const [sortMode, setSortMode] = useState<SortMode>('capacity_first');
  const [sortOpen, setSortOpen] = useState(false);

  const [calendarConnection, setCalendarConnection] = useState<{ connected_email: string | null } | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const [homeLocation, setHomeLocation] = useState('');
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [workLocation, setWorkLocation] = useState('');
  const [workCoords, setWorkCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) {
      loadSettings();
      loadCalendarConnection();
    }
  }, [session]);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    if (sortOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortOpen]);

  async function loadSettings() {
    const userId = session.user.id;
    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, work_days, notification_style, sort_mode, theme, home_location_text, home_lat, home_lng, work_location_text, work_lat, work_lng')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setSortMode((settings.sort_mode as SortMode) || 'capacity_first');
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setWorkDays(settings.work_days && settings.work_days.length > 0 ? settings.work_days : [1, 2, 3, 4, 5]);
      setNotificationStyle(settings.notification_style || 'default');
      const storedTheme = (settings.theme as Theme) || 'system';
      setTheme(storedTheme);
      applyTheme(storedTheme);

      setHomeLocation(settings.home_location_text || '');
      if (settings.home_lat != null && settings.home_lng != null) {
        setHomeCoords({ lat: settings.home_lat, lng: settings.home_lng });
      }
      setWorkLocation(settings.work_location_text || '');
      if (settings.work_lat != null && settings.work_lng != null) {
        setWorkCoords({ lat: settings.work_lat, lng: settings.work_lng });
      }
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

  // ── Auto-save helpers ──────────────────────────────────────────
  async function saveField(field: Record<string, any>) {
    await supabase.from('user_settings').update(field).eq('user_id', session.user.id);
  }

  function toggleDay(day: number) {
    setWorkDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b);
      saveField({ work_days: next });
      return next;
    });
  }

  function handleWorkStartChange(value: string) {
    setWorkStart(value);
    saveField({ work_start: value });
  }

  function handleWorkEndChange(value: string) {
    setWorkEnd(value);
    saveField({ work_end: value });
  }

  function handleHomeSelected(result: { formattedAddress: string; lat: number; lng: number }) {
    setHomeLocation(result.formattedAddress);
    setHomeCoords({ lat: result.lat, lng: result.lng });
    saveField({
      home_location_text: result.formattedAddress,
      home_lat: result.lat,
      home_lng: result.lng,
    });
  }

  function handleWorkSelected(result: { formattedAddress: string; lat: number; lng: number }) {
    setWorkLocation(result.formattedAddress);
    setWorkCoords({ lat: result.lat, lng: result.lng });
    saveField({
      work_location_text: result.formattedAddress,
      work_lat: result.lat,
      work_lng: result.lng,
    });
  }

  async function saveSortMode(mode: SortMode) {
    setSortMode(mode);
    setSortOpen(false);
    await supabase.from('user_settings').update({ sort_mode: mode }).eq('user_id', session.user.id);
  }

  async function saveNotificationStyle(style: 'default' | 'silent') {
    setNotificationStyle(style);
    await supabase.from('user_settings').update({ notification_style: style }).eq('user_id', session.user.id);
  }

  async function saveTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    await supabase.from('user_settings').update({ theme: next }).eq('user_id', session.user.id);
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
        <AppHeader title="Settings" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  const activeSort = SORT_OPTIONS.find((o) => o.value === sortMode)!;

  return (
    <div className="app-shell">
      <AppHeader title="Settings" backHref="/" />

      {/* ── Work Day ─────────────────────────────────────────── */}
      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Work day</div>

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

        <div className="settings-row" style={{ gap: 'var(--space-3)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span className="settings-label">Start</span>
            <input type="time" value={workStart} onChange={(e) => handleWorkStartChange(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span className="settings-label">End</span>
            <input type="time" value={workEnd} onChange={(e) => handleWorkEndChange(e.target.value)} />
          </label>
        </div>

        <button
          className="settings-disclosure"
          onClick={() => setLocationsOpen(!locationsOpen)}
          aria-expanded={locationsOpen}
        >
          Base locations
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: locationsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {locationsOpen && (
          <div className="settings-disclosure-body">
            <span className="settings-label">Home</span>
            <LocationAutocomplete
              value={homeLocation}
              placeholder="Home address"
              onChange={setHomeLocation}
              onPlaceSelected={handleHomeSelected}
            />
            {homeLocation.length > 0 && !homeCoords && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                Pick a suggestion from the list so this can anchor drive-time calculations.
              </p>
            )}

            <span className="settings-label" style={{ marginTop: 'var(--space-2)' }}>Work / office</span>
            <LocationAutocomplete
              value={workLocation}
              placeholder="Office address"
              onChange={setWorkLocation}
              onPlaceSelected={handleWorkSelected}
            />
            {workLocation.length > 0 && !workCoords && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                Pick a suggestion from the list so this can anchor drive-time calculations.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Today ────────────────────────────────────────────── */}
      <div className="settings-panel">
        <div className="settings-panel-title">Today</div>

        <div className="sort-select" ref={sortMenuRef}>
          <button className="sort-select-trigger" onClick={() => setSortOpen(!sortOpen)}>
            <span>{activeSort.label}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: sortOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {sortOpen && (
            <div className="sort-select-menu">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={sortMode === opt.value ? 'sort-select-option active' : 'sort-select-option'}
                  onClick={() => saveSortMode(opt.value)}
                >
                  <span className="sort-select-option-label">{opt.label}</span>
                  <span className="sort-select-option-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {sortMode === 'manual' && (
          <p className="settings-help">A drag handle appears on each task.</p>
        )}
      </div>

      {/* ── Notifications ────────────────────────────────────── */}
      <div className="settings-panel">
        <div className="settings-panel-title">Notifications</div>
        <p className="settings-help">
          A nudge when a task is nearing its estimate, and again if it runs over.
        </p>

        <div className="settings-row">
          <button className="btn btn-steel" onClick={enableNotifications}>Enable notifications</button>
          <button className="btn-text" onClick={sendTestNotification}>Send test</button>
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

        <div className="settings-info-note">
          <InfoIcon />
          <span>
            Dokkit runs as a web app — notifications only get pushed while your screen is awake.
            Background delivery is being finalised.
          </span>
        </div>
      </div>

      {/* ── Calendar ─────────────────────────────────────────── */}
      <div className="settings-panel">
        <div className="settings-panel-title">Calendar</div>
        {calendarMessage && <div className="settings-status">{calendarMessage}</div>}
        {calendarConnection ? (
          <>
            <p className="settings-help">
              Connected{calendarConnection.connected_email ? ` as ${calendarConnection.connected_email}` : ''}.
              Today's meetings are pulled in automatically.
            </p>
            <button className="btn btn-ghost" onClick={disconnectCalendar} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect calendar'}
            </button>
          </>
        ) : (
          <>
            <p className="settings-help">
              Outlook calendar sync is being finalised — this will open up in a future update.
            </p>
            <button className="btn btn-ghost" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              Connect Outlook Calendar — coming soon
            </button>
          </>
        )}
      </div>

      {/* ── Appearance ───────────────────────────────────────── */}
      <div className="settings-panel">
        <div className="settings-panel-title">Appearance</div>
        <div className="segmented">
          {([
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ] as { value: Theme; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              className={theme === opt.value ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => saveTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
