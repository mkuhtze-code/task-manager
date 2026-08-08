'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import NearbySheet, { NearbySuggestion } from '@/components/NearbySheet';

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
  base_location_text: string | null;
  base_lat: number | null;
  base_lng: number | null;
  drive_from_base_mins: number | null;
};

type Activity = {
  id: string;
  trip_day_id: string;
  text: string;
  activity_type: 'stop' | 'drive' | 'flight' | 'other';
  estimate_mins: number;
  drive_mins_to_next: number;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  order_index: number;
  status: 'pending' | 'done';
};

type DragState = {
  id: string;
  originalIndex: number;
  currentIndex: number;
  startY: number;
  offsetY: number;
  rowHeight: number;
  orderSnapshot: string[];
};

type Leg = {
  fromLabel: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  directMins: number;
  insertIndex: number;
};

const ROW_GAP = 8;

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

async function authedFetch(url: string, body: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
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

function DragHandleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function ActivityDetailSheet(props: {
  activity: Activity;
  tripDays: TripDay[];
  onClose: () => void;
  onSave: (id: string, text: string, estimateMins: number, location: string, lat: number | null, lng: number | null) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToDay: (id: string, newTripDayId: string) => void;
}) {
  const { activity: a, tripDays, onClose, onSave, onComplete, onDelete, onMoveToDay } = props;
  const [text, setText] = useState(a.text);
  const [estimateStr, setEstimateStr] = useState(fmtMins(a.estimate_mins));
  const [location, setLocation] = useState(a.location_text || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null
  );
  const [error, setError] = useState('');

  function commit() {
    const est = parseMins(estimateStr);
    if (est === null || est < 0) {
      setError('Could not read a time — try 15m or 1.5h');
      return;
    }
    setError('');
    onSave(a.id, text.trim() || a.text, est, location.trim(), coords?.lat ?? null, coords?.lng ?? null);
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

        <LocationAutocomplete
          value={location}
          placeholder="Search for a place"
          onChange={setLocation}
          onPlaceSelected={(result) => {
            setLocation(result.formattedAddress);
            setCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {location.length > 0 && !coords && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
            Pick a suggestion from the list so drive time can be calculated for this stop.
          </p>
        )}

        <div style={{ flex: 1 }}>
          <span className="settings-label">Time here</span>
          <input type="text" value={estimateStr} onChange={(e) => setEstimateStr(e.target.value)} onBlur={commit} style={{ width: '100%' }} />
        </div>

        {a.drive_mins_to_next > 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            Drive to next stop: <span className="mono" style={{ fontWeight: 700 }}>{fmtMins(a.drive_mins_to_next)}</span> (calculated)
          </p>
        )}
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

function BaseEditorSheet(props: {
  tripDay: TripDay;
  onClose: () => void;
  onSave: (locationText: string, lat: number | null, lng: number | null) => void;
}) {
  const { tripDay, onClose, onSave } = props;
  const [location, setLocation] = useState(tripDay.base_location_text || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    tripDay.base_lat != null && tripDay.base_lng != null ? { lat: tripDay.base_lat, lng: tripDay.base_lng } : null
  );

  function commit() {
    onSave(location.trim(), coords?.lat ?? null, coords?.lng ?? null);
  }

  return (
    <div className="sheet-backdrop" onClick={() => { commit(); onClose(); }}>
      <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-title">Where are you staying?</div>
        <LocationAutocomplete
          value={location}
          placeholder="Hotel or accommodation"
          onChange={setLocation}
          onPlaceSelected={(result) => {
            setLocation(result.formattedAddress);
            setCoords({ lat: result.lat, lng: result.lng });
          }}
        />
        {location.length > 0 && !coords && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
            Pick a suggestion so this can anchor your drive-time calculations.
          </p>
        )}
        <button className="btn btn-steel" onClick={() => { commit(); onClose(); }}>Save</button>
        <button className="btn-text" onClick={onClose}>Cancel</button>
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
  const [recalculating, setRecalculating] = useState(false);

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [baseEditorOpen, setBaseEditorOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureCoords, setCaptureCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [captureEstimate, setCaptureEstimate] = useState('30m');
  const [error, setError] = useState('');

  const [dragState, setDragState] = useState<DragState | null>(null);
  const rowElsRef = useRef<Record<string, HTMLDivElement | null>>({});

  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbySuggestions, setNearbySuggestions] = useState<NearbySuggestion[]>([]);
  const [nearbyInsertIndex, setNearbyInsertIndex] = useState<number | null>(null);

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

  async function refreshSelectedDay() {
    if (!selectedDayId) return;
    const { data } = await supabase.from('trip_days').select('*').eq('id', selectedDayId).maybeSingle();
    if (data) {
      setTripDays((prev) => prev.map((d) => (d.id === data.id ? data : d)));
    }
  }

  async function recalculateDay() {
    if (!selectedDayId) return;
    setRecalculating(true);
    try {
      await authedFetch('/api/travel/calculate-day', { trip_day_id: selectedDayId });
      await loadActivities();
      await refreshSelectedDay();
    } finally {
      setRecalculating(false);
    }
  }

  async function addActivity() {
    const text = captureText.trim();
    if (text.length === 0 || !selectedDayId || !session) return;
    const est = parseMins(captureEstimate);
    if (est === null) {
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
        drive_mins_to_next: 0,
        location_text: captureLocation.trim() || null,
        lat: captureCoords?.lat ?? null,
        lng: captureCoords?.lng ?? null,
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
    setCaptureLocation('');
    setCaptureCoords(null);
    setCaptureEstimate('30m');
    setCaptureOpen(false);
    if (data.lat != null) recalculateDay();
  }

  async function updateActivity(id: string, text: string, estimateMins: number, location: string, lat: number | null, lng: number | null) {
    await supabase
      .from('activities')
      .update({ text, estimate_mins: estimateMins, location_text: location || null, lat, lng })
      .eq('id', id);
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, text, estimate_mins: estimateMins, location_text: location || null, lat, lng } : a))
    );
    recalculateDay();
  }

  async function completeActivity(id: string) {
    await supabase.from('activities').update({ status: 'done' }).eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    recalculateDay();
  }

  async function deleteActivity(id: string) {
    await supabase.from('activities').delete().eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    recalculateDay();
  }

  async function moveActivityToDay(id: string, newTripDayId: string) {
    await supabase.from('activities').update({ trip_day_id: newTripDayId, order_index: 0 }).eq('id', id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    recalculateDay();
  }

  async function saveBase(locationText: string, lat: number | null, lng: number | null) {
    if (!selectedDayId) return;
    await supabase
      .from('trip_days')
      .update({ base_location_text: locationText || null, base_lat: lat, base_lng: lng })
      .eq('id', selectedDayId);
    await refreshSelectedDay();
    if (lat != null) recalculateDay();
  }

  // ── Manual drag-to-reorder — same mechanic as Dokkit's task list ────
  function handleDragHandlePointerDown(e: React.PointerEvent, activityId: string, currentOrderIds: string[]) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const originalIndex = currentOrderIds.indexOf(activityId);
    const rowEl = rowElsRef.current[activityId];
    const rect = rowEl?.getBoundingClientRect();
    const rowHeight = (rect?.height || 60) + ROW_GAP;
    setDragState({
      id: activityId,
      originalIndex,
      currentIndex: originalIndex,
      startY: e.clientY,
      offsetY: 0,
      rowHeight,
      orderSnapshot: currentOrderIds,
    });
  }

  function handleDragHandlePointerMove(e: React.PointerEvent) {
    setDragState((prev) => {
      if (!prev) return prev;
      const deltaY = e.clientY - prev.startY;
      const indexShift = Math.round(deltaY / prev.rowHeight);
      const maxIndex = prev.orderSnapshot.length - 1;
      const nextIndex = Math.min(Math.max(prev.originalIndex + indexShift, 0), maxIndex);
      return { ...prev, offsetY: deltaY, currentIndex: nextIndex };
    });
  }

  async function handleDragHandlePointerUp() {
    const finalState = dragState;
    setDragState(null);
    if (!finalState) return;
    const { id, originalIndex, currentIndex, orderSnapshot } = finalState;
    if (currentIndex === originalIndex) return;

    const newOrderIds = [...orderSnapshot];
    newOrderIds.splice(originalIndex, 1);
    newOrderIds.splice(currentIndex, 0, id);

    setActivities((prev) => {
      const byId: Record<string, Activity> = {};
      prev.forEach((a) => (byId[a.id] = a));
      const reindexed = newOrderIds.filter((aid) => byId[aid]).map((aid, idx) => ({ ...byId[aid], order_index: idx }));
      const others = prev.filter((a) => !newOrderIds.includes(a.id));
      return [...reindexed, ...others];
    });

    await Promise.all(
      newOrderIds.map((aid, idx) => supabase.from('activities').update({ order_index: idx }).eq('id', aid))
    );
    recalculateDay();
  }

  const selectedDay = tripDays.find((d) => d.id === selectedDayId) || null;

  // ── Legs for "find something nearby" — one per stretch of driving in
  // the current order: base→first stop (if base is set), then each
  // consecutive stop→stop pair. Recomputed whenever the order or base
  // changes, since insertIndex depends on current position in the list.
  const legs: Leg[] = useMemo(() => {
    if (!selectedDay) return [];
    const out: Leg[] = [];
    const hasBase = selectedDay.base_lat != null && selectedDay.base_lng != null;

    if (hasBase && activities.length > 0 && activities[0].lat != null && activities[0].lng != null) {
      out.push({
        fromLabel: 'start',
        fromLat: selectedDay.base_lat as number,
        fromLng: selectedDay.base_lng as number,
        toLat: activities[0].lat,
        toLng: activities[0].lng,
        directMins: selectedDay.drive_from_base_mins || 0,
        insertIndex: 0,
      });
    }

    for (let i = 0; i < activities.length - 1; i++) {
      const a = activities[i];
      const b = activities[i + 1];
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
      out.push({
        fromLabel: a.text,
        fromLat: a.lat,
        fromLng: a.lng,
        toLat: b.lat,
        toLng: b.lng,
        directMins: a.drive_mins_to_next,
        insertIndex: i + 1,
      });
    }

    return out;
  }, [selectedDay, activities]);

  async function findNearby(leg: Leg) {
    setNearbyInsertIndex(leg.insertIndex);
    setNearbyOpen(true);
    setNearbyLoading(true);
    setNearbySuggestions([]);
    try {
      const json = await authedFetch('/api/travel/nearby-on-route', {
        originLat: leg.fromLat,
        originLng: leg.fromLng,
        destLat: leg.toLat,
        destLng: leg.toLng,
        directMins: leg.directMins,
      });
      setNearbySuggestions(json.suggestions || []);
    } finally {
      setNearbyLoading(false);
    }
  }

  async function insertNearbySuggestion(s: NearbySuggestion) {
    if (!selectedDayId || !session || nearbyInsertIndex === null) return;
    setNearbyOpen(false);

    const { data: inserted, error: insertError } = await supabase
      .from('activities')
      .insert({
        user_id: session.user.id,
        trip_day_id: selectedDayId,
        text: s.name,
        estimate_mins: 30,
        drive_mins_to_next: 0,
        location_text: s.address,
        lat: s.lat,
        lng: s.lng,
        order_index: 9999,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      alert(insertError?.message || 'Could not add stop');
      return;
    }

    const currentIds = activities.map((a) => a.id);
    const newOrderIds = [...currentIds];
    newOrderIds.splice(nearbyInsertIndex, 0, inserted.id);

    await Promise.all(
      newOrderIds.map((id, idx) => supabase.from('activities').update({ order_index: idx }).eq('id', id))
    );

    await loadActivities();
    recalculateDay();
  }

  const dayStartMinutes = selectedDay ? timeStringToMinutes(selectedDay.day_start) : 0;
  const dayEndMinutes = selectedDay ? timeStringToMinutes(selectedDay.day_end) : 0;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();

  const todayStr = now.toISOString().slice(0, 10);
  const isToday = selectedDay?.date === todayStr;
  const minutesLeftToday = isToday ? Math.max(dayEndMinutes - nowMinutesOfDay, 0) : Math.max(dayEndMinutes - dayStartMinutes, 0);

  const driveFromBase = selectedDay?.drive_from_base_mins || 0;
  const plannedMins = driveFromBase + activities.reduce((sum, a) => sum + a.estimate_mins + a.drive_mins_to_next, 0);
  const overloaded = minutesLeftToday > 0 && plannedMins > minutesLeftToday;

  const trackSpan = Math.max(dayEndMinutes - dayStartMinutes, 1);
  const nowPercent = isToday ? Math.min(Math.max((nowMinutesOfDay - dayStartMinutes) / trackSpan, 0), 1) : 0;
  const projectedFinish = (isToday ? nowMinutesOfDay : dayStartMinutes) + plannedMins;
  const projectedPercent = (projectedFinish - dayStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);

  const openActivity = openActivityId ? activities.find((a) => a.id === openActivityId) || null : null;
  const orderedIds = activities.map((a) => a.id);

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
        <>
          <button
            className="btn-text"
            style={{ padding: 0, marginBottom: 'var(--space-2)' }}
            onClick={() => setBaseEditorOpen(true)}
          >
            {selectedDay.base_location_text
              ? `Staying at ${selectedDay.base_location_text}`
              : 'Set where you\'re staying →'}
          </button>

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

            <button
              className="btn-text"
              style={{ marginTop: 'var(--space-2)', padding: 0 }}
              onClick={recalculateDay}
              disabled={recalculating}
            >
              {recalculating ? 'Recalculating drive times…' : 'Recalculate drive times'}
            </button>

            {legs.length === 0 && activities.length > 0 && (
  <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
    No nearby suggestions available for this day yet — this needs either a base set above, or at least two stops with a location picked from the search suggestions (not just typed).
  </p>
)}
          </div>

          {legs.length > 0 && activities.length === 0 && selectedDay.base_lat != null && (
            <div className="empty-state">Add a stop to see what's nearby your base.</div>
          )}
        </>
      )}

      <div className="task-list">
        {activities.length === 0 && (
          <div className="empty-state">Nothing planned for this day yet.<br />Tap + to add a stop.</div>
        )}
        {selectedDay && selectedDay.base_lat != null && activities.length > 0 && (
          (() => {
            const startLeg = legs.find((l) => l.insertIndex === 0 && l.fromLabel === 'start');
            return startLeg ? (
              <button
                className="btn-text"
                style={{ padding: '2px 0 6px', fontSize: 12 }}
                onClick={() => findNearby(startLeg)}
              >
                Find something nearby, on the way from your base →
              </button>
            ) : null;
          })()
        )}
        {activities.map((a, idx) => {
          let rowStyle: React.CSSProperties = {};
          if (dragState) {
            if (a.id === dragState.id) {
              rowStyle = {
                transform: `translateY(${dragState.offsetY}px) scale(1.02)`,
                transition: 'none',
                zIndex: 30,
                position: 'relative',
                boxShadow: '0 10px 24px rgba(26,41,51,0.3)',
              };
            } else {
              const { originalIndex, currentIndex, rowHeight } = dragState;
              let shift = 0;
              if (originalIndex < currentIndex && idx > originalIndex && idx <= currentIndex) shift = -1;
              else if (originalIndex > currentIndex && idx >= currentIndex && idx < originalIndex) shift = 1;
              rowStyle = {
                transform: `translateY(${shift * rowHeight}px)`,
                transition: 'transform 0.2s var(--ease)',
                position: 'relative',
                zIndex: 1,
              };
            }
          }

          const legAfterThis = legs.find((l) => l.insertIndex === idx + 1 && l.fromLabel === a.text);

          return (
            <div key={a.id} ref={(el) => { rowElsRef.current[a.id] = el; }} style={rowStyle}>
              <div className={a.activity_type === 'stop' ? 'task-row' : 'task-row task-list-item'}>
                <div className="swipe-zone">
                  <div className="swipe-foreground">
                    <div className="task-main">
                      <div className="task-body" onClick={() => setOpenActivityId(a.id)}>
                        <div className="task-text">{a.text}</div>
                        <div className="task-tags">
                          <span className="tag tag-elapsed mono">{fmtMins(a.estimate_mins)} there</span>
                          {a.drive_mins_to_next > 0 && (
                            <span className="tag mono">+{fmtMins(a.drive_mins_to_next)} drive</span>
                          )}
                          {a.location_text && <span className="tag">{a.location_text}</span>}
                          {a.location_text && a.lat == null && (
                            <span className="tag tag-due">no coords — drive time skipped</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="drag-handle-btn"
                        onPointerDown={(e) => { e.stopPropagation(); handleDragHandlePointerDown(e, a.id, orderedIds); }}
                        onPointerMove={(e) => { e.stopPropagation(); handleDragHandlePointerMove(e); }}
                        onPointerUp={(e) => { e.stopPropagation(); handleDragHandlePointerUp(); }}
                        onPointerCancel={(e) => { e.stopPropagation(); handleDragHandlePointerUp(); }}
                        aria-label="Drag to reorder"
                      >
                        <DragHandleIcon />
                      </button>
                    </div>
                    {legAfterThis && (
                      <button
                        className="btn-text"
                        style={{ padding: '4px 0 0', fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); findNearby(legAfterThis); }}
                      >
                        Find something nearby →
                      </button>
                    )}
                  </div>
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
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            placeholder="What's the stop?"
          />
          <LocationAutocomplete
            value={captureLocation}
            placeholder="Search for a place"
            onChange={setCaptureLocation}
            onPlaceSelected={(result) => {
              setCaptureLocation(result.formattedAddress);
              setCaptureCoords({ lat: result.lat, lng: result.lng });
            }}
          />
          <div>
            <span className="settings-label">Time there</span>
            <input type="text" value={captureEstimate} onChange={(e) => setCaptureEstimate(e.target.value)} style={{ width: '100%' }} />
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

      {baseEditorOpen && selectedDay && (
        <BaseEditorSheet
          tripDay={selectedDay}
          onClose={() => setBaseEditorOpen(false)}
          onSave={saveBase}
        />
      )}

      {nearbyOpen && (
        <NearbySheet
          loading={nearbyLoading}
          suggestions={nearbySuggestions}
          onClose={() => setNearbyOpen(false)}
          onPick={insertNearbySuggestion}
        />
      )}
    </div>
  );
}
