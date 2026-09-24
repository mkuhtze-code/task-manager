'use client';

import '../travel.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch } from '@/lib/authedFetch';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import LibrarySheet from '@/components/LibrarySheet';
import NearbySheet, { NearbySuggestion } from '@/components/NearbySheet';
import AccommodationSheet from '@/components/AccommodationSheet';
import DaySheet from '@/components/DaySheet';
import TripDayMeetings from '@/components/TripDayMeetings';
import MapView from '@/components/MapView';
import { TravelLeg } from '@/components/TravelLeg';
import { sortActivities, findFixedTimeConflicts, SortMode as TravelSortMode } from '@/lib/travelSort';
import GearMenu from '@/components/GearMenu';
import {
  BackIcon,
  BedIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CompassIcon,
  DragHandleIcon,
  FitCheckIcon,
  LockIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import SurfaceNav from '@/components/SurfaceNav';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import type { Job } from '@/lib/jobTypes';
import {
  STOP_KIND_OPTIONS,
  PRESENCE_OPTIONS,
  presenceToSchedule,
  formatStopGlance,
  stopKindLabel,
  type StopKind,
  type StopPresence,
} from '@/lib/travelStopTypes';
import { computeTravelPresenceImpact } from '@/lib/travelPresence';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { fetchDurationHistory } from '@/lib/thinking/loadDurationHistory';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';

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
  arrival_time: string | null;
  departure_time: string | null;
  route_polyline: string | null;
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
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
  route_polyline: string | null;
  stop_kind?: StopKind | null;
  presence?: StopPresence | null;
  job_id?: string | null;
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

// fromId is null for the base→first-stop leg (nothing "is" the base as an
// activity), and an activity id for every other leg. toId is always an
// activity id. Matching legs by id (not text) is what fixes the bug where
// two stops sharing a name would collide, and where sort-mode reordering
// broke which "find nearby" button belonged to which leg.
type Leg = {
  fromId: string | null;
  toId: string;
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

function ActivityDetailSheet(props: {
  activity: Activity;
  tripDays: TripDay[];
  jobs: Job[];
  dayLabel: string;
  dayIndex: number;
  dayCount: number;
  driveFromPrevMins: number | null;
  driveFromPrevLabel: string | null;
  conflict: boolean;
  dayFitLabel: string | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    text: string;
    estimateMins: number;
    location: string;
    lat: number | null;
    lng: number | null;
    timeType: 'flexible' | 'fixed';
    fixedTime: string | null;
    stopKind: StopKind;
    presence: StopPresence;
    jobId: string | null;
  }) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToDay: (id: string, newTripDayId: string) => void;
}) {
  const {
    activity: a,
    tripDays,
    jobs,
    dayLabel,
    dayIndex,
    dayCount,
    driveFromPrevMins,
    driveFromPrevLabel,
    conflict,
    dayFitLabel,
    onClose,
    onSave,
    onComplete,
    onDelete,
    onMoveToDay,
  } = props;

  const [text, setText] = useState(a.text);
  const [estimateStr, setEstimateStr] = useState(fmtMins(a.estimate_mins));
  const [location, setLocation] = useState(a.location_text || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null
  );
  const [stopKind, setStopKind] = useState<StopKind>((a.stop_kind as StopKind) || 'leisure');
  const [presence, setPresence] = useState<StopPresence>((a.presence as StopPresence) || 'duration');
  const [jobId, setJobId] = useState<string | null>(a.job_id ?? null);
  const [fixedTime, setFixedTime] = useState(a.fixed_time || '');
  const [moveOpen, setMoveOpen] = useState(false);
  const [error, setError] = useState('');

  const linkedJob = jobId ? jobs.find((j) => j.id === jobId) : null;

  function commit() {
    let durationMins: number | null = null;
    if (presence === 'duration' || presence === 'fixed') {
      durationMins = parseMins(estimateStr);
      if (durationMins === null || durationMins < 0) {
        setError('Could not read a time — try 15m or 1.5h');
        return;
      }
    }
    if (presence === 'fixed' && !fixedTime) {
      setError('Set a time for this stop');
      return;
    }

    // Day window defaults when editing without selected day times on hand
    const dayStart = 8 * 60;
    const dayEnd = 20 * 60;
    const schedule = presenceToSchedule({
      presence,
      durationMins,
      fixedTime: fixedTime || null,
      dayStartMins: dayStart,
      dayEndMins: dayEnd,
    });

    let loc = location.trim();
    let lat = coords?.lat ?? null;
    let lng = coords?.lng ?? null;
    if (stopKind === 'work' && jobId) {
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        if (!loc && job.location_text) loc = job.location_text;
        if (lat == null && job.lat != null) {
          lat = job.lat;
          lng = job.lng;
        }
      }
    }

    setError('');
    onSave({
      id: a.id,
      text: text.trim() || a.text,
      estimateMins: schedule.estimate_mins,
      location: loc,
      lat,
      lng,
      timeType: schedule.time_type,
      fixedTime: schedule.fixed_time,
      stopKind,
      presence,
      jobId: stopKind === 'work' ? jobId : null,
    });
  }

  function handleDeleteClick() {
    if (window.confirm(`Remove “${a.text}” from this day?`)) {
      onDelete(a.id);
      onClose();
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={() => {
        commit();
        onClose();
      }}
    >
      <div className="capture-sheet task-detail-sheet stop-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header" style={{ justifyContent: 'flex-end' }}>
          <button
            className="gear-btn"
            onClick={() => {
              commit();
              onClose();
            }}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <span className="settings-label">Kind of stop</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {STOP_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={stopKind === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
              onClick={() => {
                setStopKind(opt.value);
                if (opt.value === 'work' && presence === 'duration') setPresence('all_day');
                if (opt.value !== 'work') setJobId(null);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="task-detail-name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          placeholder="Stop name"
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
        <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '0 0 8px' }}>
          {coords ? 'Mapped — drives can be calculated' : 'Not mapped yet — pick a place suggestion'}
        </p>

        {stopKind === 'work' && (
          <div style={{ marginBottom: 12 }}>
            <span className="settings-label">Job</span>
            <select
              value={jobId || ''}
              onChange={(e) => {
                const id = e.target.value || null;
                setJobId(id);
                const job = jobs.find((j) => j.id === id);
                if (job) {
                  if (!text.trim() || text === a.text) setText(job.name);
                  if (job.location_text) {
                    setLocation(job.location_text);
                    if (job.lat != null && job.lng != null) {
                      setCoords({ lat: job.lat, lng: job.lng });
                    }
                  }
                }
              }}
              style={{
                width: '100%',
                marginTop: 4,
                marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line-strong)',
                background: 'var(--paper)',
                fontSize: 14,
              }}
            >
              <option value="">No job linked</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                  {j.client ? ` · ${j.client}` : ''}
                </option>
              ))}
            </select>
            {linkedJob && (
              <Link
                href={`/jobs/${linkedJob.id}`}
                className="meeting-pill meeting-pill--primary"
                style={{ display: 'inline-flex', textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                Open job →
              </Link>
            )}
            <p style={{ fontSize: 11, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
              Evidence and files live on the job — this stop is where you are.
            </p>
          </div>
        )}

        <span className="settings-label">When are you there?</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={presence === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
              onClick={() => setPresence(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(presence === 'duration' || presence === 'fixed') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            <span className="settings-label">About</span>
            <input
              type="text"
              value={estimateStr}
              onChange={(e) => setEstimateStr(e.target.value)}
              onBlur={commit}
              placeholder="30m or 1.5h"
            />
          </div>
        )}
        {presence === 'fixed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            <span className="settings-label">At</span>
            <input
              type="time"
              value={fixedTime}
              onChange={(e) => setFixedTime(e.target.value)}
              onBlur={commit}
            />
          </div>
        )}

        {/* Day context / intelligence */}
        <div className="stop-context-strip">
          <div className="stop-context-line">
            <span className="stop-context-kicker">This day</span>
            <span>
              {dayLabel}
              {dayCount > 1 ? ` · Day ${dayIndex} of ${dayCount}` : ''}
            </span>
          </div>
          {(driveFromPrevMins != null && driveFromPrevMins > 0) || a.drive_mins_to_next > 0 ? (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Route</span>
              <span>
                {driveFromPrevMins != null && driveFromPrevMins > 0
                  ? `${fmtMins(driveFromPrevMins)} from ${driveFromPrevLabel || 'previous'}`
                  : null}
                {driveFromPrevMins != null && driveFromPrevMins > 0 && a.drive_mins_to_next > 0
                  ? ' · '
                  : null}
                {a.drive_mins_to_next > 0 ? `${fmtMins(a.drive_mins_to_next)} to next` : null}
              </span>
            </div>
          ) : null}
          {dayFitLabel && (
            <div className="stop-context-line">
              <span className="stop-context-kicker">Fit</span>
              <span>{dayFitLabel}</span>
            </div>
          )}
          {conflict && (
            <div className="stop-context-line stop-context-warn">
              <span className="stop-context-kicker">Conflict</span>
              <span>Won&apos;t make this time with the current order</span>
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>
        )}

        <button
          className="btn btn-steel"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'stretch',
            justifyContent: 'center',
            marginTop: 4,
          }}
          onClick={() => {
            onComplete(a.id);
            onClose();
          }}
        >
          <FitCheckIcon /> Done here
        </button>

        {tripDays.length > 1 && (
          <>
            <button
              className={moveOpen ? 'detail-reveal active' : 'detail-reveal'}
              onClick={() => setMoveOpen(!moveOpen)}
              aria-expanded={moveOpen}
            >
              <span>Move to another day</span>
              <ChevronIcon size={14} />
            </button>
            {moveOpen && (
              <div className="move-day-list">
                {tripDays
                  .filter((d) => d.id !== a.trip_day_id)
                  .map((d) => {
                    const label = fmtDayLabel(d.date);
                    return (
                      <button
                        key={d.id}
                        className="move-day-option"
                        onClick={() => {
                          onMoveToDay(a.id, d.id);
                          onClose();
                        }}
                      >
                        {label.weekday}, {label.date}
                      </button>
                    );
                  })}
              </div>
            )}
          </>
        )}

        <div className="detail-delete">
          <button
            className="btn-text"
            style={{
              color: 'var(--danger-text, var(--danger))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            }}
            onClick={handleDeleteClick}
          >
            <TrashIcon /> Remove stop
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TripDayView() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.tripId as string;
  const { isDesktop } = useSurfaceMode();

  const [session, setSession] = useState<any>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripDays, setTripDays] = useState<TripDay[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
  const [now, setNow] = useState(new Date());
  const [recalculating, setRecalculating] = useState(false);

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [accommodationSheetOpen, setAccommodationSheetOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
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
  const [nearbyCategory, setNearbyCategory] = useState('attraction');
  const [nearbyLeg, setNearbyLeg] = useState<Leg | null>(null);
  const [nearbyContext, setNearbyContext] = useState<string | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  const nearbyCacheRef = useRef<Record<string, NearbySuggestion[]>>({});

    const [travelSortMode, setTravelSortMode] = useState<TravelSortMode>('manual');
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [dayMeetingCount, setDayMeetingCount] = useState(0);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
    const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const [captureTimeType, setCaptureTimeType] = useState<'flexible' | 'fixed'>('flexible');
  const [captureFixedTime, setCaptureFixedTime] = useState('');
  const [captureStopKind, setCaptureStopKind] = useState<StopKind>('leisure');
  const [capturePresence, setCapturePresence] = useState<StopPresence>('duration');
  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

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

  useEffect(() => {
    if (!session?.user?.id) return;
    void supabase
      .from('jobs')
      .select('id, name, client, location_text, lat, lng, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs((data as Job[]) || []));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    fetchDurationHistory(supabase, session.user.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

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

    if (session) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('travel_sort_mode')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (settings?.travel_sort_mode) {
        setTravelSortMode(settings.travel_sort_mode as TravelSortMode);
      }
    }
  }

    useEffect(() => {
    if (selectedDayId) loadActivities();
  }, [selectedDayId]);

  // Keep the active day chip in view on the persistent strip.
  useEffect(() => {
    if (!selectedDayId || !dayStripRef.current) return;
    const el = dayStripRef.current.querySelector(`[data-day-id="${selectedDayId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDayId]);

  async function loadActivities(dayIdOverride?: string) {
    const dayId = dayIdOverride || selectedDayId;
    if (!dayId) return;
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('trip_day_id', dayId)
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

  async function recalculateDay(dayIdOverride?: string) {
    const dayId = dayIdOverride || selectedDayId;
    if (!dayId) return;
    setRecalculating(true);
    setRecalcError(null);
    try {
      const json = await authedFetch('/api/travel/calculate-day', { trip_day_id: dayId });
      if (json.error) {
        setRecalcError(json.error);
      } else {
        nearbyCacheRef.current = {};
      }
      await loadActivities();
      await refreshSelectedDay();
    } catch {
      setRecalcError('Could not reach the server — check your connection and try again.');
    } finally {
      setRecalculating(false);
    }
  }

  async function addActivity() {
    const text = captureText.trim();
    if (text.length === 0 || !selectedDayId || !session) return;

    if (captureStopKind === 'work' && !captureJobId && !captureLocation.trim()) {
      setError('Link a job or set a location for this work site');
      return;
    }
    if (capturePresence === 'fixed' && !captureFixedTime) {
      setError('Set a time for this stop');
      return;
    }
    let durationMins: number | null = null;
    if (capturePresence === 'duration' || capturePresence === 'fixed') {
      durationMins = parseMins(captureEstimate);
      if (durationMins === null) {
        setError('Could not read a time — try 15m or 1.5h');
        return;
      }
    }

    const dayStart = selectedDay
      ? timeStringToMinutes(selectedDay.arrival_time || selectedDay.day_start || '08:00')
      : 8 * 60;
    const dayEnd = selectedDay
      ? timeStringToMinutes(selectedDay.departure_time || selectedDay.day_end || '20:00')
      : 20 * 60;

    const schedule = presenceToSchedule({
      presence: capturePresence,
      durationMins,
      fixedTime: captureFixedTime || null,
      dayStartMins: dayStart,
      dayEndMins: dayEnd,
    });

    // Prefer job name when work-linked and title empty of place
    let stopText = text;
    if (captureStopKind === 'work' && captureJobId) {
      const job = jobs.find((j) => j.id === captureJobId);
      if (job && (text === job.name || text.length === 0)) stopText = job.name;
    }

    setError('');
    const maxOrder = activities.reduce((m, a) => Math.max(m, a.order_index), 0);

    let loc = captureLocation.trim() || null;
    let lat = captureCoords?.lat ?? null;
    let lng = captureCoords?.lng ?? null;
    if (captureStopKind === 'work' && captureJobId) {
      const job = jobs.find((j) => j.id === captureJobId);
      if (job) {
        if (!loc && job.location_text) loc = job.location_text;
        if (lat == null && job.lat != null) {
          lat = job.lat;
          lng = job.lng;
        }
      }
    }

    const { data, error: insertError } = await supabase
      .from('activities')
      .insert({
        user_id: session.user.id,
        trip_day_id: selectedDayId,
        text: stopText,
        activity_type: 'stop',
        estimate_mins: schedule.estimate_mins,
        drive_mins_to_next: 0,
        location_text: loc,
        lat,
        lng,
        order_index: maxOrder + 1,
        time_type: schedule.time_type,
        fixed_time: schedule.fixed_time,
        stop_kind: captureStopKind,
        presence: capturePresence,
        job_id: captureStopKind === 'work' ? captureJobId : null,
      })
      .select()
      .single();
    if (insertError) {
      alert(insertError.message);
      return;
    }
    setActivities((prev) => [...prev, data as Activity]);
    setCaptureText('');
    setCaptureLocation('');
    setCaptureCoords(null);
    setCaptureEstimate('30m');
    setCaptureTimeType('flexible');
    setCaptureFixedTime('');
    setCaptureStopKind('leisure');
    setCapturePresence('duration');
    setCaptureJobId(null);
    setCaptureOpen(false);
    if ((data as Activity).lat != null) recalculateDay();
  }

  function closeCapture() {
    setCaptureOpen(false);
    setError('');
    setCaptureStopKind('leisure');
    setCapturePresence('duration');
    setCaptureJobId(null);
  }

  async function updateActivity(payload: {
    id: string;
    text: string;
    estimateMins: number;
    location: string;
    lat: number | null;
    lng: number | null;
    timeType: 'flexible' | 'fixed';
    fixedTime: string | null;
    stopKind: StopKind;
    presence: StopPresence;
    jobId: string | null;
  }) {
    const { id, text, estimateMins, location, lat, lng, timeType, fixedTime, stopKind, presence, jobId } =
      payload;
    const { error } = await supabase
      .from('activities')
      .update({
        text,
        estimate_mins: estimateMins,
        location_text: location || null,
        lat,
        lng,
        time_type: timeType,
        fixed_time: fixedTime,
        stop_kind: stopKind,
        presence,
        job_id: jobId,
      })
      .eq('id', id);
    if (error) {
      alert('Could not save the stop: ' + error.message);
      return;
    }
    setActivities((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              text,
              estimate_mins: estimateMins,
              location_text: location || null,
              lat,
              lng,
              time_type: timeType,
              fixed_time: fixedTime,
              stop_kind: stopKind,
              presence,
              job_id: jobId,
            }
          : row
      )
    );
    recalculateDay();
  }

  async function completeActivity(id: string) {
    const activity = activities.find((a) => a.id === id);
    const { error } = await supabase.from('activities').update({ status: 'done' }).eq('id', id);
    if (error) {
      alert('Could not complete the stop: ' + error.message);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    // Ambient reality: duration-style stops contribute when estimate is real.
    // Presence blocks (all_day / work_hours) are capacity signals, not timer actuals.
    if (activity && session?.user?.id) {
      const presence = (activity.presence as string) || 'duration';
      const measured =
        presence === 'duration' || presence === 'fixed'
          ? Math.round(activity.estimate_mins || 0)
          : 0;
      closeCompletionLoop({
        userId: session.user.id,
        taskText: activity.text,
        estimateMins: activity.estimate_mins || 0,
        measuredMins: measured,
        history,
        clusters,
        hints: {
          estimateMins: activity.estimate_mins,
          loggedMins: measured,
          jobId: activity.job_id,
        },
      });
    }
    recalculateDay();
  }

  async function deleteActivity(id: string) {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      alert('Could not delete the stop: ' + error.message);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    recalculateDay();
  }

  async function moveActivityToDay(id: string, newTripDayId: string) {
    const { error } = await supabase.from('activities').update({ trip_day_id: newTripDayId, order_index: 0 }).eq('id', id);
    if (error) {
      alert('Could not move the stop: ' + error.message);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    recalculateDay();
  }

  // A Library item was scheduled into tripDayId by the LibrarySheet, which
  // already inserted the activity (copied name/location/coords). Switch to
  // that day, reload it, and let the normal route engine take over.
  async function handleLibraryScheduled(tripDayId: string) {
    setLibraryOpen(false);
    setSelectedDayId(tripDayId);
    await loadActivities(tripDayId);
    recalculateDay(tripDayId);
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

  async function changeSortMode(mode: TravelSortMode) {
    const previous = travelSortMode;
    setTravelSortMode(mode);
    if (!session) return;
    const { error } = await supabase.from('user_settings').update({ travel_sort_mode: mode }).eq('user_id', session.user.id);
    if (error) {
      setTravelSortMode(previous);
      alert('Could not save the order preference: ' + error.message);
    }
  }

  const selectedDay = tripDays.find((d) => d.id === selectedDayId) || null;
  const selectedDayIndex = tripDays.findIndex((d) => d.id === selectedDayId);

    function goToAdjacentDay(dir: -1 | 1) {
    if (selectedDayIndex < 0 || tripDays.length < 2) return;
    const next = selectedDayIndex + dir;
    if (next < 0 || next >= tripDays.length) return;
    setSelectedDayId(tripDays[next].id);
  }

  function onDaySwipeStart(e: React.TouchEvent) {
    if (dragState || tripDays.length < 2) return;
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  }

  function onDaySwipeMove(e: React.TouchEvent) {
    const s = swipeRef.current;
    if (!s?.active) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Vertical intent → abandon so drag-reorder wins
    if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) {
      swipeRef.current = null;
    }
  }

  function onDaySwipeEnd(e: React.TouchEvent) {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s?.active || dragState) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    goToAdjacentDay(dx < 0 ? 1 : -1);
  }

  const legs: Leg[] = useMemo(() => {
    if (!selectedDay) return [];
    const out: Leg[] = [];
    const hasBase = selectedDay.base_lat != null && selectedDay.base_lng != null;

    if (hasBase && activities.length > 0 && activities[0].lat != null && activities[0].lng != null) {
      out.push({
        fromId: null,
        toId: activities[0].id,
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
        fromId: a.id,
        toId: b.id,
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

  function legCacheKey(leg: Leg, category: string): string {
    return `${leg.fromId ?? 'base'}__${leg.toId}__${category}`;
  }

  async function runNearbySearch(leg: Leg, category: string) {
    const key = legCacheKey(leg, category);
    const cached = nearbyCacheRef.current[key];
    if (cached) {
      setNearbySuggestions(cached);
      setNearbyError(null);
      setNearbyLoading(false);
      return;
    }

    setNearbyLoading(true);
    setNearbySuggestions([]);
    setNearbyError(null);
    try {
      const json = await authedFetch('/api/travel/nearby-on-route', {
        originLat: leg.fromLat,
        originLng: leg.fromLng,
        destLat: leg.toLat,
        destLng: leg.toLng,
        directMins: leg.directMins,
        category,
      });
      if (json.error) {
        setNearbyError(json.error);
        return;
      }
      const results: NearbySuggestion[] = json.suggestions || [];
      nearbyCacheRef.current[key] = results;
      setNearbySuggestions(results);
    } catch {
      setNearbyError('Could not reach the server — check your connection and try again.');
    } finally {
      setNearbyLoading(false);
    }
  }

  async function findNearby(leg: Leg) {
    setNearbyLeg(leg);
    setNearbyInsertIndex(leg.insertIndex);
    const fromAct = leg.fromId ? activities.find((x) => x.id === leg.fromId) : null;
    const toAct = activities.find((x) => x.id === leg.toId);
    const toName = toAct?.location_text || toAct?.text || 'the next stop';
    setNearbyContext(
      fromAct
        ? `On the way from ${fromAct.location_text || fromAct.text} to ${toName}`
        : `On the way from ${selectedDay?.base_location_text || 'your base'} to ${toName}`
    );
    setNearbyOpen(true);
    runNearbySearch(leg, nearbyCategory);
  }

  function handleCategoryChange(category: string) {
    setNearbyCategory(category);
    if (nearbyLeg) runNearbySearch(nearbyLeg, category);
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

  const effectiveDayStart = selectedDay?.arrival_time || selectedDay?.day_start || '08:00';
  const effectiveDayEnd = selectedDay?.departure_time || selectedDay?.day_end || '20:00';

  const dayStartMinutes = selectedDay ? timeStringToMinutes(effectiveDayStart) : 0;
  const dayEndMinutes = selectedDay ? timeStringToMinutes(effectiveDayEnd) : 0;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();

  const todayStr = now.toISOString().slice(0, 10);
  const isToday = selectedDay?.date === todayStr;
  const minutesLeftToday = isToday ? Math.max(dayEndMinutes - nowMinutesOfDay, 0) : Math.max(dayEndMinutes - dayStartMinutes, 0);

  const driveFromBase = selectedDay?.drive_from_base_mins || 0;
  const plannedMins = driveFromBase + activities.reduce((sum, a) => sum + a.estimate_mins + a.drive_mins_to_next, 0);
  const overloaded = minutesLeftToday > 0 && plannedMins > minutesLeftToday;
  const spareMins = minutesLeftToday - plannedMins;

  const trackSpan = Math.max(dayEndMinutes - dayStartMinutes, 1);
  const nowPercent = isToday ? Math.min(Math.max((nowMinutesOfDay - dayStartMinutes) / trackSpan, 0), 1) : 0;
  const projectedFinish = (isToday ? nowMinutesOfDay : dayStartMinutes) + plannedMins;
  const projectedPercent = (projectedFinish - dayStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);

  const referencePoint = selectedDay?.base_lat != null && selectedDay?.base_lng != null
    ? { lat: selectedDay.base_lat, lng: selectedDay.base_lng }
    : null;

  const sortedActivities = useMemo(
    () => sortActivities(activities as any, travelSortMode, referencePoint) as Activity[],
    [activities, travelSortMode, referencePoint]
  );

  const fixedTimeConflicts = useMemo(
    () => findFixedTimeConflicts(sortedActivities as any, dayStartMinutes),
    [sortedActivities, dayStartMinutes]
  );


  // Meetings on selected trip day (user-scoped).
  useEffect(() => {
    if (!session?.user?.id || !selectedDay?.date) {
      setDayMeetingCount(0);
      return;
    }
    const uid = session.user.id;
    const dateStr = selectedDay.date;
    let cancelled = false;
    void (async () => {
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59.999`;
      const { count } = await supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd);
      if (!cancelled) setDayMeetingCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, selectedDay?.date]);

  const openActivity = openActivityId ? activities.find((a) => a.id === openActivityId) || null : null;
  const orderedIds = activities.map((a) => a.id);

  if (!session || !trip) {
    return <div className="app-shell" style={{ paddingTop: 40 }}>Loading…</div>;
  }

  return (
    <div className={`app-shell${isDesktop ? ' desk-trip-detail' : ''}`}>
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/travel')} aria-label="Back"><BackIcon /></button>
          <div>
            <h1 className="app-title" style={{ fontSize: 'var(--text-lg)', lineHeight: 1.15 }}>{trip.name}</h1>
          </div>
        </div>
        <div className="app-header-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setAccommodationSheetOpen(true)}
          >
            Stay
          </button>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setLibraryOpen(true)}
          >
            Library
          </button>
          <GearMenu context="travel" userId={session?.user.id ?? null} />
        </div>
            </div>

      {tripDays.length > 0 && (
        <div className="trip-day-strip" ref={dayStripRef} role="tablist" aria-label="Trip days">
          {tripDays.map((d, i) => {
            const label = fmtDayLabel(d.date);
            const active = d.id === selectedDayId;
            const isDayToday = d.date === todayStr;
            const dayNum = String(parseInt(d.date.slice(8, 10), 10));
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-day-id={d.id}
                className={`trip-day-chip${active ? ' active' : ''}${isDayToday ? ' is-today' : ''}`}
                onClick={() => setSelectedDayId(d.id)}
              >
                <span className="trip-day-chip-wd">{label.weekday}</span>
                <span className="trip-day-chip-num mono">{dayNum}</span>
                {tripDays.length > 1 && active && (
                  <span className="trip-day-chip-pos">Day {i + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedDay && (
        <button
          className="day-head"
          onClick={() => setDaySheetOpen(true)}
          aria-expanded={daySheetOpen}
        >
          <span className="day-head-left">
            <span className="day-head-label">{fmtDayLabel(selectedDay.date).weekday} {fmtDayLabel(selectedDay.date).date}</span>
            <span className="day-head-pos">Day {selectedDayIndex + 1} of {tripDays.length} · day detail</span>
          </span>
          <span className="day-head-right">
            {activities.length > 0 && minutesLeftToday > 0 && (
              <span className={overloaded ? 'day-head-fit over' : 'day-head-fit'}>
                {overloaded ? `Over by ${fmtMins(-spareMins)}` : `Fits · ${fmtMins(spareMins)} spare`}
              </span>
            )}
            <span className="day-head-chev" aria-hidden="true"><ChevronIcon size={14} /></span>
          </span>
        </button>
      )}

      {recalcError && (
        <button className="recalc-error" onClick={() => recalculateDay()} disabled={recalculating}>
          Drive times couldn't update — tap to retry
        </button>
      )}

            <div
        className="task-list"
        onTouchStart={onDaySwipeStart}
        onTouchMove={onDaySwipeMove}
        onTouchEnd={onDaySwipeEnd}
      >

        {session?.user?.id && selectedDay && (
          <TripDayMeetings userId={session.user.id} dateStr={selectedDay.date} />
        )}

        {activities.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">
              Nothing planned for {selectedDay ? fmtDayLabel(selectedDay.date).weekday : 'this day'} yet
            </div>
            <div className="empty-state-sub">Add your first stop — Dokkit works out the route and how the day fits.</div>
            <button className="btn btn-steel" onClick={() => setCaptureOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon size={16} /> Add a stop
            </button>
          </div>
        )}

        {selectedDay && activities.length > 0 && (selectedDay.base_lat != null || selectedDay.base_location_text) && (
          <button className="stay-anchor" onClick={() => setAccommodationSheetOpen(true)}>
            <span className="stay-anchor-icon"><BedIcon /></span>
            <span className="stay-anchor-text">
              <span className="stay-anchor-title">{selectedDay.base_location_text || 'Set where you are staying'}</span>
              {selectedDay.base_location_text && <span className="stay-anchor-sub">your base for the day</span>}
            </span>
            <ChevronIcon size={14} />
          </button>
        )}

        {selectedDay && selectedDay.base_lat != null && activities.length > 0 && (
          (() => {
            const startLeg = legs.find((l) => l.insertIndex === 0 && l.fromId === null);
            if (!startLeg || startLeg.directMins <= 0) return null;
            return (
              <TravelLeg
                label={fmtMins(startLeg.directMins)}
                detail={`Drive from ${selectedDay.base_location_text || 'base'}`}
                action={
                  <button onClick={() => findNearby(startLeg)} aria-label="Find something nearby on this drive">
                    <CompassIcon size={12} /> Nearby
                  </button>
                }
              />
            );
          })()
        )}
        {sortedActivities.map((a, idx) => {
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

          const legAfterThis = legs.find((l) => l.fromId === a.id);
          const nextStop = legAfterThis ? activities.find((x) => x.id === legAfterThis.toId) : null;
          const conflict = !!fixedTimeConflicts[a.id];

          return (
            <div key={a.id} ref={(el) => { rowElsRef.current[a.id] = el; }} style={rowStyle}>
              <div className={[
                a.activity_type === 'stop' ? 'task-row' : 'task-row task-list-item',
                conflict ? 'conflict' : '',
              ].join(' ').trim()}>
                <div className="task-main">
                  <button
                    className="check-btn"
                    onClick={(e) => { e.stopPropagation(); completeActivity(a.id); }}
                    aria-label="Mark complete"
                  >
                    <CheckIcon done={false} />
                  </button>
                  <div className="task-body" onClick={() => setOpenActivityId(a.id)}>
                    <div className="task-text">
                      {a.stop_kind && a.stop_kind !== 'leisure' && (
                        <span className="stop-kind-chip">{stopKindLabel(a.stop_kind)}</span>
                      )}
                      {a.text}
                    </div>
                    {((a.location_text && a.lat == null) || conflict) && (
                      <div className="activity-meta">
                        {a.location_text && a.lat == null && (
                          <span className="activity-meta-loc" title={a.location_text}>
                            <MapPinIcon size={12} />
                            <span className="activity-meta-loc-text">{a.location_text}</span>
                            <span className="activity-meta-hint">· not mapped</span>
                          </span>
                        )}
                        {conflict && <span className="activity-meta-conflict">won't make it</span>}
                      </div>
                    )}
                  </div>
                  <span className={conflict ? 'activity-glance conflict mono' : 'activity-glance mono'}>
                    {formatStopGlance({
                      presence: a.presence,
                      time_type: a.time_type,
                      fixed_time: a.fixed_time,
                      estimate_mins: a.estimate_mins,
                      fmtMins,
                      fmtClock,
                    })}
                  </span>
                  {a.time_type === 'flexible' && travelSortMode === 'manual' ? (
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
                  ) : a.time_type === 'fixed' ? (
                    <span
                      className="drag-handle-btn"
                      style={{ color: 'var(--ink-faint)', cursor: 'default' }}
                      title="Fixed time — locked in place"
                      aria-label="Fixed time, locked in place"
                    >
                      <LockIcon />
                    </span>
                  ) : null}
                </div>
                {legAfterThis && legAfterThis.directMins > 0 && (
                  <TravelLeg
                    label={fmtMins(legAfterThis.directMins)}
                    detail={`Drive to ${nextStop?.location_text || nextStop?.text || 'the next stop'}`}
                    action={
                      <button onClick={() => findNearby(legAfterThis)} aria-label="Find something nearby on this drive">
                        <CompassIcon size={12} /> Nearby
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {captureOpen && (
        <div className="sheet-backdrop" onClick={closeCapture}>
          <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="task-detail-header" style={{ marginBottom: 0 }}>
              <div className="settings-panel-title">Where next?</div>
              <button className="gear-btn" onClick={closeCapture} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
              A stop is a place you&apos;ll be — not a task to finish.
            </p>

            <span className="settings-label">What kind of stop?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {STOP_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={captureStopKind === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
                  onClick={() => {
                    setCaptureStopKind(opt.value);
                    if (opt.value === 'work') setCapturePresence('all_day');
                    if (opt.value !== 'work') setCaptureJobId(null);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {captureStopKind === 'work' && (
              <div style={{ marginBottom: 10 }}>
                <span className="settings-label">Job (optional but recommended)</span>
                <select
                  value={captureJobId || ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    setCaptureJobId(id);
                    const job = jobs.find((j) => j.id === id);
                    if (job) {
                      if (!captureText.trim()) setCaptureText(job.name);
                      if (job.location_text) {
                        setCaptureLocation(job.location_text);
                        if (job.lat != null && job.lng != null) {
                          setCaptureCoords({ lat: job.lat, lng: job.lng });
                        }
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line-strong)',
                    background: 'var(--paper)',
                    fontSize: 14,
                  }}
                >
                  <option value="">No job linked</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                      {j.client ? ` · ${j.client}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input
              type="text"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              placeholder={captureStopKind === 'work' ? 'Site or job name' : 'Where / what is this stop?'}
              autoFocus
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

            <span className="settings-label" style={{ marginTop: 4 }}>When are you there?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PRESENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={capturePresence === opt.value ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
                  onClick={() => setCapturePresence(opt.value)}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {(capturePresence === 'duration' || capturePresence === 'fixed') && (
              <div className="capture-row">
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="settings-label">About</span>
                  <input type="text" value={captureEstimate} onChange={(e) => setCaptureEstimate(e.target.value)} placeholder="30m or 1.5h" />
                </div>
              </div>
            )}
            {capturePresence === 'fixed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="settings-label">At</span>
                <input type="time" value={captureFixedTime} onChange={(e) => setCaptureFixedTime(e.target.value)} />
              </div>
            )}
            {capturePresence === 'all_day' && (
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
                Counts as the full day window for capacity on this trip day.
              </p>
            )}
            {capturePresence === 'work_hours' && (
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
                Uses most of the day window — evening stops can still fit.
              </p>
            )}

            {captureLocation.length > 0 && !captureCoords && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                Pick a suggestion so drive times can be calculated.
              </p>
            )}
            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn btn-steel" onClick={addActivity}>Add stop</button>
          </div>
        </div>
      )}

      {openActivity && (
        <ActivityDetailSheet
          activity={openActivity}
          tripDays={tripDays}
          jobs={jobs}
          dayLabel={
            selectedDay
              ? `${fmtDayLabel(selectedDay.date).weekday} ${fmtDayLabel(selectedDay.date).date}`
              : 'This day'
          }
          dayIndex={selectedDayIndex >= 0 ? selectedDayIndex + 1 : 1}
          dayCount={tripDays.length}
          driveFromPrevMins={(() => {
            const legIn = legs.find((l) => l.toId === openActivity.id);
            return legIn && legIn.directMins > 0 ? legIn.directMins : null;
          })()}
          driveFromPrevLabel={(() => {
            const legIn = legs.find((l) => l.toId === openActivity.id);
            if (!legIn) return null;
            if (legIn.fromId == null) return selectedDay?.base_location_text || 'stay';
            const prev = activities.find((x) => x.id === legIn.fromId);
            return prev?.location_text || prev?.text || 'previous';
          })()}
          conflict={!!fixedTimeConflicts[openActivity.id]}
          dayFitLabel={
            activities.length > 0 && minutesLeftToday > 0
              ? overloaded
                ? `Over by ${fmtMins(-spareMins)}`
                : `Fits · ${fmtMins(spareMins)} spare`
              : null
          }
          onClose={() => setOpenActivityId(null)}
          onSave={updateActivity}
          onComplete={completeActivity}
          onDelete={deleteActivity}
          onMoveToDay={moveActivityToDay}
        />
      )}

      {accommodationSheetOpen && (
        <AccommodationSheet
          tripId={tripId}
          tripStartDate={trip.start_date}
          tripEndDate={trip.end_date}
          onClose={() => setAccommodationSheetOpen(false)}
          onSynced={async () => {
            await loadTrip();
            await refreshSelectedDay();
            recalculateDay();
          }}
        />
      )}

      {libraryOpen && (
        <LibrarySheet
          tripId={tripId}
          tripName={trip.name}
          tripDays={tripDays}
          onClose={() => setLibraryOpen(false)}
          onScheduled={handleLibraryScheduled}
        />
      )}

      {nearbyOpen && (
        <NearbySheet
          loading={nearbyLoading}
          error={nearbyError}
          suggestions={nearbySuggestions}
          selectedCategory={nearbyCategory}
          onCategoryChange={handleCategoryChange}
          onClose={() => setNearbyOpen(false)}
          onPick={insertNearbySuggestion}
          context={nearbyContext}
        />
      )}

      {mapOpen && (
        <MapView
          base={selectedDay ? {
            location_text: selectedDay.base_location_text,
            lat: selectedDay.base_lat,
            lng: selectedDay.base_lng,
            route_polyline: selectedDay.route_polyline,
          } : null}
          activities={activities.map((a) => ({ ...a, conflict: !!fixedTimeConflicts[a.id] }))}
          onClose={() => setMapOpen(false)}
        />
      )}

      {daySheetOpen && selectedDay && (
        <DaySheet
          dayIndex={selectedDayIndex}
          tripDays={tripDays}
          selectedDayId={selectedDayId || ''}
          onSelectDay={setSelectedDayId}
          hasActivities={activities.length > 0}
          overloaded={overloaded}
          spareMins={spareMins}
          plannedMins={plannedMins}
          minutesLeftToday={minutesLeftToday}
          isToday={isToday}
          nowPercent={nowPercent}
          planWidthPercent={planWidthPercent}
          presence={(() => {
            const impact = computeTravelPresenceImpact(
              activities,
              minutesLeftToday > 0 ? minutesLeftToday : 480,
              480
            );
            return {
              mode: impact.mode,
              workStopCount: impact.workStopCount,
              totalStops: activities.filter((a) => (a.status || 'pending') !== 'done').length,
              summaryLabel: impact.summaryLabel,
            };
          })()}
          stayLabel={
            selectedDay.base_location_text ||
            (selectedDay.base_lat != null ? 'Stay mapped' : null)
          }
          meetingCount={dayMeetingCount}
          hasRoute={activities.some((a) => a.lat != null) || (selectedDay.base_lat != null)}
          sortMode={travelSortMode}
          onChangeSortMode={changeSortMode}
          onOpenAccommodation={() => { setDaySheetOpen(false); setAccommodationSheetOpen(true); }}
          onOpenMap={() => { setDaySheetOpen(false); setMapOpen(true); }}
          onOpenLibrary={() => { setDaySheetOpen(false); setLibraryOpen(true); }}
          onClose={() => setDaySheetOpen(false)}
        />
      )}

      <SurfaceNav
        active="travel"
        onAdd={!captureOpen ? () => setCaptureOpen(true) : undefined}
        addLabel="Add stop"
      />
    </div>
  );
}
