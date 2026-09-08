'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiUrl, authedFetch } from '@/lib/authedFetch';
import AppHeader from '@/components/AppHeader';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import type { MeetingExportPreferences } from '@/lib/meetingExport';
import { DEFAULT_MEETING_EXPORT_PREFS, normalizeMeetingExportPrefs } from '@/lib/meetingExport';

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
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
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

export default function Preferences() {
  const [session, setSession] = useState<any>(null);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notificationStyle, setNotificationStyle] = useState<'default' | 'silent'>('default');
  const [notifStatus, setNotifStatus] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      const stored = localStorage.getItem('dokkit-theme') as Theme | null;
      return stored || 'system';
    } catch (e) {
      return 'system';
    }
  });

  type SortMode = 'capacity_first' | 'due_today_first' | 'manual' | 'oldest_first' | 'newest_first' | 'geo_aware';
  const [sortMode, setSortMode] = useState<SortMode>('capacity_first');
  const [sortSavedMsg, setSortSavedMsg] = useState('');

  const [calendarConnection, setCalendarConnection] = useState<{
    provider: string;
    connected_email: string | null;
    sync_status: string | null;
    sync_error: string | null;
  } | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // The user's Microsoft connections, each with its discovered calendars +
  // current selection. Calendars are read-only external time; `selected`
  // controls which ones feed Today's External Commitments.
  const [calendarConnectionsState, setCalendarConnectionsState] = useState<
    Array<{
      connection_id: string;
      provider: string;
      connected_email: string | null;
      calendars: Array<{
        id: string;
        provider_calendar_id: string;
        name: string;
        is_default: boolean;
        selected: boolean;
      }>;
    }>
  >([]);
  const [calendarsSavingId, setCalendarsSavingId] = useState<string | null>(null);
  const [calendarListMsg, setCalendarListMsg] = useState('');

  // Meeting export preferences — what a new export starts with, chosen in
  // the per-export Review only for that export.
  const [exportPrefs, setExportPrefs] = useState<MeetingExportPreferences>(DEFAULT_MEETING_EXPORT_PREFS);
  const [exportPrefsMsg, setExportPrefsMsg] = useState('');

  // ── Home & Work — the "base" pins geo_aware sort mode routes from,
  // switching automatically between them based on work hours already
  // set above, same base concept as Travel's accommodation, applied to
  // an ordinary day instead of a trip.
  const [homeLocation, setHomeLocation] = useState('');
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [workLocation, setWorkLocation] = useState('');
  const [workCoords, setWorkCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placesSavedMsg, setPlacesSavedMsg] = useState('');
  const [placesSaving, setPlacesSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) {
      loadSettings();
      loadCalendarConnection();
      loadExternalCalendars();
    }
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      setCalendarMessage('Calendar connected — your commitments will show up in Today within a few minutes.');
    } else if (params.get('calendar') === 'denied') {
      setCalendarMessage('You chose not to connect your calendar. No changes were made.');
    } else if (params.get('calendar') === 'expired') {
      setCalendarMessage('That connection link expired — try again.');
    } else if (params.get('calendar') === 'invalid' || params.get('calendar') === 'missing') {
      setCalendarMessage('That connection link was incomplete or invalid — please try again.');
    } else if (params.get('calendar') === 'not_authed') {
      setCalendarMessage('Please sign in again, then reconnect your calendar.');
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
      .select('work_start, work_end, work_days, notification_style, sort_mode, theme, home_location_text, home_lat, home_lng, work_location_text, work_lat, work_lng, meeting_export_prefs')
      .eq('user_id', userId)
      .maybeSingle();
    if (settings) {
      setExportPrefs(normalizeMeetingExportPrefs(settings.meeting_export_prefs));
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
      .select('provider, connected_email, sync_status, sync_error')
      .eq('user_id', session.user.id)
      .eq('provider', 'microsoft')
      .order('created_at', { ascending: true })
      .limit(1);
    const row = Array.isArray(data) ? data[0] : null;
    setCalendarConnection(row || null);
  }

  async function loadExternalCalendars() {
    try {
      const res = await fetch(apiUrl('/api/calendar/calendars'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        return;
      }
      const payload = await res.json();
      if (Array.isArray(payload?.connections)) {
        setCalendarConnectionsState(payload.connections);
      }
    } catch {
      // Calendars are a progressive enhancement here — leave the panel
      // showing just the connection state on failure.
    }
  }

  async function toggleExternalCalendar(calendar: { id: string; selected: boolean }) {
    const next = !calendar.selected;
    setCalendarsSavingId(calendar.id);
    setCalendarListMsg('');
    try {
      const res = await fetch(apiUrl('/api/calendar/calendars'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ calendarId: calendar.id, selected: next }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) {
        setCalendarListMsg(payload?.error || 'Could not update calendars — try again.');
        return;
      }
      setCalendarConnectionsState((prev) =>
        prev.map((conn) => ({
          ...conn,
          calendars: conn.calendars.map((c) =>
            c.id === calendar.id ? { ...c, selected: next } : c
          ),
        }))
      );
    } catch {
      setCalendarListMsg('Could not update calendars — try again.');
    } finally {
      setCalendarsSavingId(null);
    }
  }

  async function connectCalendar() {
    setConnecting(true);
    setCalendarMessage('');
    try {
      const payload = await authedFetch('/api/auth/microsoft/connect', {});
      if (payload?.url) {
        window.location.assign(payload.url);
        return;
      }
      setCalendarMessage(payload?.error || 'Could not start connecting your calendar. Please try again.');
      setConnecting(false);
    } catch {
      setCalendarMessage('Could not start connecting your calendar. Please try again.');
      setConnecting(false);
    }
  }

  async function disconnectCalendar() {
    setDisconnecting(true);
    await fetch(apiUrl('/api/auth/microsoft/disconnect'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    setCalendarConnection(null);
    setCalendarConnectionsState([]);
    setCalendarListMsg('');
    setCalendarMessage('Calendar disconnected.');
    setDisconnecting(false);
  }

  function toggleDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function saveWorkHours() {
    const { error } = await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd, work_days: workDays })
      .eq('user_id', session.user.id);
    setSavedMsg(error ? 'Could not save: ' + error.message : 'Work hours saved.');
    setTimeout(() => setSavedMsg(''), error ? 4000 : 2000);
  }

  async function saveSortMode(mode: SortMode) {
    const previous = sortMode;
    setSortMode(mode);
    const { error } = await supabase.from('user_settings').update({ sort_mode: mode }).eq('user_id', session.user.id);
    if (error) {
      setSortMode(previous);
      setSortSavedMsg('Could not save: ' + error.message);
      setTimeout(() => setSortSavedMsg(''), 4000);
      return;
    }
    setSortSavedMsg('Saved.');
    setTimeout(() => setSortSavedMsg(''), 1500);
  }

  async function saveNotificationStyle(style: 'default' | 'silent') {
    const previous = notificationStyle;
    setNotificationStyle(style);
    const { error } = await supabase.from('user_settings').update({ notification_style: style }).eq('user_id', session.user.id);
    if (error) {
      setNotificationStyle(previous);
      setNotifStatus('Could not save notification setting: ' + error.message);
      setTimeout(() => setNotifStatus(''), 4000);
    }
  }

  async function saveTheme(next: Theme) {
    const previous = theme;
    setTheme(next);
    applyTheme(next);
    const { error } = await supabase.from('user_settings').update({ theme: next }).eq('user_id', session.user.id);
    if (error) {
      setTheme(previous);
      applyTheme(previous);
    }
  }

  async function saveExportPrefs(next: MeetingExportPreferences) {
    const previous = exportPrefs;
    setExportPrefs(next);
    const { error } = await supabase
      .from('user_settings')
      .update({ meeting_export_prefs: next })
      .eq('user_id', session.user.id);
    if (error) {
      setExportPrefs(previous);
      setExportPrefsMsg('Could not save: ' + error.message);
      setTimeout(() => setExportPrefsMsg(''), 4000);
      return;
    }
    setExportPrefsMsg('Saved.');
    setTimeout(() => setExportPrefsMsg(''), 1500);
  }

  function toggleExportPref(key: keyof MeetingExportPreferences) {
    if (typeof exportPrefs[key] !== 'boolean') return;
    void saveExportPrefs({ ...exportPrefs, [key]: !exportPrefs[key] });
  }

  async function saveHomeWork() {
    setPlacesSaving(true);
    const { error } = await supabase
      .from('user_settings')
      .update({
        home_location_text: homeLocation || null,
        home_lat: homeCoords?.lat ?? null,
        home_lng: homeCoords?.lng ?? null,
        work_location_text: workLocation || null,
        work_lat: workCoords?.lat ?? null,
        work_lng: workCoords?.lng ?? null,
      })
      .eq('user_id', session.user.id);
    setPlacesSaving(false);
    setPlacesSavedMsg(error ? 'Could not save: ' + error.message : 'Saved.');
    setTimeout(() => setPlacesSavedMsg(''), 2000);
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
      await fetch(apiUrl('/api/subscribe'), {
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
    const res = await fetch(apiUrl('/api/send-test-notification'), {
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

      <div className="settings-panel">
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
        <div className="settings-panel-title">Home &amp; work</div>
        <p className="settings-help">
          Used as the starting and ending point when Dokkit works out drive time for located tasks —
          your office during work hours (set above), home otherwise, switching automatically.
        </p>

        <span className="settings-label">Home</span>
        <LocationAutocomplete
          value={homeLocation}
          placeholder="Home address"
          onChange={setHomeLocation}
          onPlaceSelected={(result) => {
            setHomeLocation(result.formattedAddress);
            setHomeCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {homeLocation.length > 0 && !homeCoords && (
          <p className="settings-hint">
            Pick a suggestion from the list so this can anchor drive-time calculations.
          </p>
        )}

        <span className="settings-label" style={{ marginTop: 'var(--space-2)' }}>Work / office</span>
        <LocationAutocomplete
          value={workLocation}
          placeholder="Office address"
          onChange={setWorkLocation}
          onPlaceSelected={(result) => {
            setWorkLocation(result.formattedAddress);
            setWorkCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {workLocation.length > 0 && !workCoords && (
          <p className="settings-hint">
            Pick a suggestion from the list so this can anchor drive-time calculations.
          </p>
        )}

        <div className="settings-row">
          <button className="btn btn-ghost" onClick={saveHomeWork} disabled={placesSaving}>
            {placesSaving ? 'Saving…' : 'Save'}
          </button>
          {placesSavedMsg && <span className="settings-saved">{placesSavedMsg}</span>}
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Task order</div>
        <p className="settings-help">
          How your task list is arranged. Choose "Manual" to drag tasks into whatever order matters
          to you — a drag handle appears on each task once this is selected.
        </p>
        <div className="sort-option-grid">
          {([
            { value: 'capacity_first', label: 'Fits today first', desc: 'Tasks that realistically fit in the time you have left float to the top — the rest are flagged, not hidden' },
            { value: 'due_today_first', label: 'Due today first', desc: 'Due-today tasks float to the top' },
            { value: 'geo_aware', label: 'Route-aware', desc: 'Located tasks are ordered by real drive distance from home or work, whichever applies right now' },
            { value: 'manual', label: 'Manual', desc: 'Drag to arrange exactly how you want' },
            { value: 'oldest_first', label: 'Oldest first', desc: 'By when each task was added' },
            { value: 'newest_first', label: 'Newest first', desc: 'Most recently added on top' },
          ] as { value: SortMode; label: string; desc: string }[]).map((opt) => (
            <button
              key={opt.value}
              className={sortMode === opt.value ? 'sort-option-btn active' : 'sort-option-btn'}
              onClick={() => saveSortMode(opt.value)}
            >
              <span className="sort-option-label">{opt.label}</span>
              <span className="sort-option-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
        {sortSavedMsg && <span className="settings-saved">{sortSavedMsg}</span>}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Meetings → Export</div>
        <p className="settings-help">
          What a new meeting export starts with. You can still adjust everything in the per-export review —
          changes there apply to that export only, these stay the default.
        </p>

        <span className="settings-label">Export type</span>
        <div className="segmented">
          {([
            { value: 'pdf', label: 'PDF' },
            { value: 'evidence_package', label: 'Evidence package' },
            { value: 'both', label: 'Both' },
          ] as { value: 'pdf' | 'evidence_package' | 'both'; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              className={exportPrefs.exportType === opt.value ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => saveExportPrefs({ ...exportPrefs, exportType: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="settings-label" style={{ marginTop: 'var(--space-3)' }}>Include by default</span>
        <div className="settings-check-list">
          {([
            { key: 'includeParticipants', label: 'Participants' },
            { key: 'includeObservations', label: 'Observations' },
            { key: 'includeDecisions', label: 'Decisions' },
            { key: 'includeActions', label: 'Actions' },
            { key: 'includeNotes', label: 'Notes (raw capture)' },
            { key: 'includePhotos', label: 'Photos' },
            { key: 'includeAudio', label: 'Voice notes' },
          ] as { key: keyof MeetingExportPreferences; label: string }[]).map((row) => (
            <button key={row.key} className="settings-check-row" onClick={() => toggleExportPref(row.key)} aria-pressed={Boolean(exportPrefs[row.key])}>
              <span className="export-check">{Boolean(exportPrefs[row.key]) && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <path d="M1.5 5.5l2.5 2.5L9.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}</span>
              <span className="settings-check-label">{row.label}</span>
            </button>
          ))}
        </div>

        <span className="settings-label" style={{ marginTop: 'var(--space-3)' }}>Transcripts</span>
        <button className="settings-check-row" onClick={() => toggleExportPref('transcribe')} aria-pressed={exportPrefs.transcribe}>
          <span className="export-check">{exportPrefs.transcribe && (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M1.5 5.5l2.5 2.5L9.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}</span>
          <span className="settings-check-label">Write transcripts of voice notes</span>
        </button>
        <p className="settings-hint">
          No transcription provider is set up yet — transcripts come with the export once one is connected.
          Voice notes always export with or without a transcript.
        </p>

        <span className="settings-label" style={{ marginTop: 'var(--space-3)' }}>PDF photo quality</span>
        <div className="segmented">
          {([
            { value: 'standard', label: 'Standard' },
            { value: 'compact', label: 'Compact' },
            { value: 'keep_quality', label: 'Keep quality' },
          ] as { value: 'standard' | 'compact' | 'keep_quality'; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              className={exportPrefs.pdfQuality === opt.value ? 'segmented-btn active' : 'segmented-btn'}
              onClick={() => saveExportPrefs({ ...exportPrefs, pdfQuality: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="settings-hint">Photos in the record are re-encoded for the PDF. The evidence package always keeps your originals untouched.</p>

        {exportPrefsMsg && <span className="settings-saved">{exportPrefsMsg}</span>}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Calendar</div>
        {calendarMessage && <div className="settings-status">{calendarMessage}</div>}
        {calendarConnection ? (
          <>
            <p className="settings-help">
              Connected Microsoft{calendarConnection.connected_email ? ` as ${calendarConnection.connected_email}` : ''}.
              Your external commitments are pulled into Today automatically and drop off your workload once
              they end — nothing to schedule or manage.
            </p>
            <p className="settings-hint">
              ✓ Calendar access (read-only).{calendarConnection.sync_status === 'error'
                ? ' The last sync failed — Dokkit retries automatically.'
                : ''}
            </p>

{calendarConnectionsState.length > 0 && (
                  <>
                    <span className="settings-label" style={{ marginTop: 'var(--space-3)' }}>
                      Calendars
                    </span>
                    <p className="settings-help">
                      Dokkit plans around the calendars you select below. Pick the ones that hold your
                      real commitments — birthdays and shared calendars stay unselected so they don't
                      quietly eat into your day.
                    </p>
                    {calendarConnectionsState.map((conn) => (
                      <div key={conn.connection_id}>
                        {calendarConnectionsState.length > 1 && (
                          <span className="settings-label" style={{ marginTop: 'var(--space-2)' }}>
                            {conn.connected_email || 'Calendar account'}
                          </span>
                        )}
                        {conn.calendars.length === 0 ? (
                          <p className="settings-hint">No calendars linked yet — they appear after the first sync.</p>
                        ) : (
                          <div className="settings-check-list">
                            {conn.calendars.map((cal) => (
                              <button
                                key={cal.id}
                                className="settings-check-row"
                                aria-pressed={cal.selected}
                                onClick={() => toggleExternalCalendar(cal)}
                                disabled={calendarsSavingId === cal.id}
                              >
                                <span className="export-check">
                                  {cal.selected && (
                                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                                      <path d="M1.5 5.5l2.5 2.5L9.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </span>
                                <span className="settings-check-label">
                                  {cal.name}
                                  {cal.is_default ? ' · default' : ''}
                                </span>
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  ))}
                <p className="settings-hint">
                  Read-only — Dokkit never edits these calendars. Changes take effect on the next sync.
                </p>
                {calendarListMsg && <span className="settings-saved">{calendarListMsg}</span>}
              </>
            )}

            <button className="btn btn-ghost" onClick={disconnectCalendar} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect calendar'}
            </button>
          </>
        ) : (
          <>
            <p className="settings-help">
              Connect your Microsoft calendar and Dokkit treats your meetings as external commitments in
              Today — they block capacity while they run and free it up as soon as they end. Read-only,
              synced automatically.
            </p>
            <button className="btn btn-steel" onClick={connectCalendar} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Microsoft Calendar'}
            </button>
          </>
        )}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Notifications</div>
        <p className="settings-help">
          A nudge when a task is nearing its estimate, and again if it runs over — enough to keep
          you aware, not enough to nag.
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
            Right now, Dokkit runs as a web app. this means notifications only get pushed while your screen is awake — background
            delivery while it's closed is being finalized. This note will go away once that's live.
          </span>
        </div>
      </div>
    </div>
  );
}
