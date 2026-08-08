'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

type TripDay = {
  id: string;
  trip_id: string;
  date: string;
  day_start: string;
  day_end: string;
  notes: string | null;
};

type Activity = {
  id: string;
  trip_day_id: string;
  text: string;
  activity_type: 'stop' | 'drive' | 'flight' | 'other';
  estimate_mins: number;
  drive_mins_to_next: number;
  location_text: string | null;
  order_index: number;
  status: 'pending' | 'done';
};

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function fmtDayLabel(dateStr: string): { weekday: string; date: string } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

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
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function ActivityDetailSheet(props: {
  activity: Activity;
  tripDays: TripDay[];
  onClose: () => void;
  onSave: (id: string, text: string, estimateMins: number, driveMins: number, location: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToDay: (id: string, newTripDayId: string) => void;
}) {
  const { activity: a, tripDays, onClose, onSave, onComplete, onDelete, onMoveToDay } = props;
  const [text, setText] = useState(a.text);
  const [estimateStr, setEstimateStr] = useState(fmtMins(a.estimate_mins));
  const [driveStr, setDriveStr] = useState(fmtMins(a.drive_mins_to_next));
  const [location, setLocation] = useState(a.location_text || '');
  const [error, setError] = useState('');

  function commit() {
    const est = parseMins(estimateStr);
    const drive = parseMins(driveStr);
    if (est === null || drive === null || est < 0 || drive < 0) {
      setError('Could not read a time — try 15m or 1.5h');
      return;
    }
    setError('');
    onSave(a.id, text.trim() || a.text, est, drive, location.trim());
  }

  return (
    <div className="sheet-backdrop" onClick={() => { commit(); onClose(); }}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <button className="btn-text" onClick={() => { commit(); onClose(); }}>Close</button>
          <button className="btn-text" onClick={() => { onDelete(a.id); onClose(); }}>Delete</button>
        </div>

        <input
          type="text"
          className="task-detail-name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />

        <input
          type="text"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={commit}
        />

        <div className="capture-row">
          <div style={{ flex: 1 }}>
            <span className="settings-label">Time here</span>
            <input type="text" value={estimateStr} onChange={(e) => setEstimateStr(e.target.value)} onBlur={commit} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <span className="settings-label">Drive to next</span>
            <input type="text" value={driveStr} onChange={(e) => setDriveStr(e.target.value)} onBlur={commit} style={{ width: '100%' }} />
          </div>
        </div>
        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        <div className="task-detail-actions">
          <button className="btn btn-steel" style={{ flex: 1 }} onClick={() => { onComplete(a.id); onClose(); }}>
            Mark done
          </button>
        </div>

        {tripDays.length > 1 && (
          <div className="subtask-panel">
            <div className="settings-panel-title">Move to another day</div>
            <div className="priority-option-list">
              {tripDays.filter((d) => d.id !== a.trip_day_id).map((d) => {
                const label = fmtDayLabel(d.date);
                return (
                  <button
                    key={d.id}
                    className="priority-option"
                    onClick={() => { onMoveToDay(a.id, d.id); onClose(); }}
                  >
                    <span className="priority-option-label">{label.weekday}, {label.date}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TripDayView() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.tripId as string;

  const [session, setSession] = useState<any>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripDays, setTripDays] = useState<TripDay[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [now, setNow] = useState(new Date());

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureEstimate, setCaptureEstimate] = useState('30m');
  const [captureDrive, setCaptureDrive] = useState('0m');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session) loadTrip();
  }, [session, tripId]);

  async function loadTrip() {
    const { data: tripRow } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    setTrip(tripRow);

    const { data: dayRows } = await supabase
      .from('trip_days')
      .select('*')
      .eq('trip_id', tripId)
      .order('date', { ascending: true });
    setTripDays(dayRows || []);

    if (dayRows && dayRows.length > 0) {
      const todayStr = now.toISOString().slice(0, 10);
      const todayMatch = dayRows.find((d: TripDay) => d.date === todayStr);
      setSelectedDayId(todayMatch ? todayMatch.id : dayRows[0].id);
    }
  }

  useEffect(() => {
    if (selectedDayId) loadActivities();
  }, [selectedDayId]);

  async function loadActivities() {
    if (!selectedDayId) return;
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('trip_day_id', selectedDayId)
      .neq('status', 'done')
      .order('order_index', { ascending: true });
    setActivities(data || []);
  }

  async function addActivity() {
    const text = captureText.trim();
    if (text.length === 0 || !selectedDayId || !session) return;
    const est = parseMins(captureEstimate);
    const drive = parseMins(captureDrive);
    if (est === null || drive === null) {
      setError('Could not read a time — try 15m or 1.5h');
      return;
    }
    setError('');
    const maxOrder = activities.reduce((m, a) => Math.max(m, a.order_index), 0);
    const { data, error: insertError } = await supabase
      .from('activities')
      .insert({
        user_id: session.user.id,
        trip_day_id: selectedDayId,
        text,
        estimate_mins: est,
        drive_mins_to_next: drive,
        order_index: maxOrder + 1,
      })
      .select()
      .single();
    if (insertError) {
      alert(insertError.message);
      return;
    }
    setActivities((prev) => [...prev, data]);
    setCaptureText('');
    setCaptureEstimate('30m');
    setCaptureDrive('0m');
    setCaptureOpen(false);
  }

  async function updateActivity(id: string, text: string, estimateMins: number, driveMins: number, location: string) {
    await supabase
      .from('activities')
      .update({ text, estimate_mins: estimateMins, drive_mins_to_next: driveMins, location_text: location || null })
      .eq('id', id);
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, text, estimate_mins: estimateMins, drive_mins_to_next: driveMins, location_text: location || null } : a))
    );
  }

  async function completeActivity(id: string) {
    await supabase.from('activities').update({ status: 'done' }).eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  async function deleteActivity(id: string) {
    await supabase.from('activities').delete().eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  async function moveActivityToDay(id: string, newTripDayId: string) {
    const maxOrder = 0; // lands at top of the new day; reorder manually after
    await supabase.from('activities').update({ trip_day_id: newTripDayId, order_index: maxOrder }).eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  const selectedDay = tripDays.find((d) => d.id === selectedDayId) || null;

  const dayStartMinutes = selectedDay ? timeStringToMinutes(selectedDay.day_start) : 0;
  const dayEndMinutes = selectedDay ? timeStringToMinutes(selectedDay.day_end) : 0;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();

  const todayStr = now.toISOString().slice(0, 10);
  const isToday = selectedDay?.date === todayStr;
  const minutesLeftToday = isToday ? Math.max(dayEndMinutes - nowMinutesOfDay, 0) : Math.max(dayEndMinutes - dayStartMinutes, 0);

  const plannedMins = activities.reduce((sum, a) => sum + a.estimate_mins + a.drive_mins_to_next, 0);
  const overloaded = minutesLeftToday > 0 && plannedMins > minutesLeftToday;

  const trackSpan = Math.max(dayEndMinutes - dayStartMinutes, 1);
  const nowPercent = isToday ? Math.min(Math.max((nowMinutesOfDay - dayStartMinutes) / trackSpan, 0), 1) : 0;
  const projectedFinish = (isToday ? nowMinutesOfDay : dayStartMinutes) + plannedMins;
  const projectedPercent = (projectedFinish - dayStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);

  const openActivity = openActivityId ? activities.find((a) => a.id === openActivityId) || null : null;

  if (!session || !trip) {
    return <div className="app-shell" style={{ paddingTop: 40 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/travel')} aria-label="Back">‹</button>
          <h1 className="app-title" style={{ fontSize: 'var(--text-lg)' }}>{trip.name}</h1>
        </div>
      </div>

      <div className="day-toggle-row" style={{ margin: 'var(--space-3) 0', overflowX: 'auto', width: '100%' }}>
        {tripDays.map((d) => {
          const label = fmtDayLabel(d.date);
          return (
            <button
              key={d.id}
              className={d.id === selectedDayId ? 'day-toggle-btn active' : 'day-toggle-btn'}
              style={{ width: 'auto', borderRadius: 20, padding: '0 12px', flexShrink: 0 }}
              onClick={() => setSelectedDayId(d.id)}
            >
              {label.weekday} {label.date}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className={overloaded ? 'today-header-card overloaded' : 'today-header-card'}>
          <div className="header-compare-row">
            <div className="header-compare-stat">
              <div className="header-compare-number mono">{fmtMins(minutesLeftToday)}</div>
              <div className="header-compare-label">{isToday ? 'time left' : 'day length'}</div>
            </div>
            <div className={overloaded ? 'header-fit-icon over' : 'header-fit-icon fits'}>
              {overloaded ? <FitWarnIcon /> : <FitCheckIcon />}
            </div>
            <div className="header-compare-stat">
              <div className={overloaded ? 'header-compare-number mono over' : 'header-compare-number mono'}>
                {fmtMins(plannedMins)}
              </div>
              <div className="header-compare-label">planned + drive</div>
            </div>
          </div>

          <div className="day-rail-wrap">
            <div className="day-rail-track">
              {isToday && <div className="day-rail-elapsed" style={{ width: `${nowPercent * 100}%` }} />}
              <div
                className={overloaded ? 'day-rail-plan over' : 'day-rail-plan'}
                style={{ left: `${nowPercent * 100}%`, width: `${planWidthPercent * 100}%` }}
              />
              {isToday && <div className="day-rail-now-dot" style={{ left: `${nowPercent * 100}%` }} />}
            </div>
            <div className="day-rail-labels">
              <span>{fmtClock(selectedDay.day_start)}</span>
              {overloaded && <span className="day-rail-overflow-label">+{fmtMins(plannedMins - minutesLeftToday)}</span>}
              <span>{fmtClock(selectedDay.day_end)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="task-list">
        {activities.length === 0 && (
          <div className="empty-state">Nothing planned for this day yet.<br />Tap + to add a stop.</div>
        )}
        {activities.map((a) => (
          <div key={a.id} className={a.activity_type === 'stop' ? 'task-row' : 'task-row task-list-item'}>
            <div className="swipe-zone">
              <div className="swipe-foreground" onClick={() => setOpenActivityId(a.id)}>
                <div className="task-main">
                  <div className="task-body">
                    <div className="task-text">{a.text}</div>
                    <div className="task-tags">
                      <span className="tag tag-elapsed mono">{fmtMins(a.estimate_mins)} there</span>
                      {a.drive_mins_to_next > 0 && (
                        <span className="tag mono">+{fmtMins(a.drive_mins_to_next)} drive</span>
                      )}
                      {a.location_text && <span className="tag">{a.location_text}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {captureOpen && (
        <div className="capture-sheet">
          <input
            type="text"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            placeholder="Where to?"
          />
          <div className="capture-row">
            <div style={{ flex: 1 }}>
              <span className="settings-label">Time there</span>
              <input type="text" value={captureEstimate} onChange={(e) => setCaptureEstimate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <span className="settings-label">Drive to next</span>
              <input type="text" value={captureDrive} onChange={(e) => setCaptureDrive(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          <button className="btn btn-steel" onClick={addActivity}>Add stop</button>
          <button className="btn-text" onClick={() => setCaptureOpen(false)}>Cancel</button>
        </div>
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Add stop">+</button>
      )}

      {openActivity && (
        <ActivityDetailSheet
          activity={openActivity}
          tripDays={tripDays}
          onClose={() => setOpenActivityId(null)}
          onSave={updateActivity}
          onComplete={completeActivity}
          onDelete={deleteActivity}
          onMoveToDay={moveActivityToDay}
        />
      )}
    </div>
  );
}
