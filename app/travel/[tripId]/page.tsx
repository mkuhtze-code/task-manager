'use client';

import '../travel.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch } from '@/lib/authedFetch';
import TripDateRangeEditor from '@/components/TripDateRangeEditor';
import { cacheTravelDayActivities, cacheTravelSnapshot, loadCachedTravelSnapshot, queueTravelMutation, reconcileCachedTravelDay, registerTravelSyncHandler } from '@/lib/travel/travelOffline';
import { flushSyncQueue, startSyncOnReconnect, subscribeOnline } from '@/lib/offline';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import ContextLine from '@/components/ContextLine';
import LibrarySheet from '@/components/LibrarySheet';
import type { NearbySuggestion } from '@/components/NearbySheet';
import FindPlaceSheet from '@/components/FindPlaceSheet';
import { buildInsertionOrder, type PlaceBiasContexts } from '@/lib/travel/placeSearch';
import AccommodationSheet from '@/components/AccommodationSheet';
import TravelVaultSheet from '@/components/TravelVaultSheet';
import DaySheet from '@/components/DaySheet';
import TripDayPanel from '@/components/TripDayPanel';
import TravelToolsStrip from '@/components/travel/TravelToolsStrip';
import TripStopRow from '@/components/TripStopRow';
import TripDayMeetings from '@/components/TripDayMeetings';
import MapView from '@/components/MapView';
import { TravelLeg } from '@/components/TravelLeg';
import { sortActivities, findFixedTimeConflicts, findUnverifiableFixedTimeStops, SortMode as TravelSortMode } from '@/lib/travelSort';
import {
  BackIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CompassIcon,
  FitCheckIcon,
  TrashIcon,
} from '@/components/icons';
import SurfaceNav from '@/components/SurfaceNav';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import ProPlanGate from '@/components/ProPlanGate';
import type { Job } from '@/lib/jobTypes';
import {
  STOP_KIND_OPTIONS,
  PRESENCE_OPTIONS,
  presenceToSchedule,
  type StopKind,
  type StopPresence,
} from '@/lib/travelStopTypes';
import { computeTravelPresenceImpact } from '@/lib/travelPresence';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { fetchDurationHistory } from '@/lib/thinking/loadDurationHistory';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';
import {
  runCaptureDock,
  loadPriorForDock,
  type EngineRequest,
} from '@/lib/engine';
import { allowCreate, classifyCaptureDockOutcome } from '@/lib/engine/dockOutcome';
import { buildTravelEngineContext, resolveScheduledDayAnchor, selectInitialTripDay } from '@/lib/travel/travelContext';
import { buildGoogleMapsDirectionsUrl, displayDriveEstimate } from '@/lib/travel/driveLegs';

type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  intent?: 'work' | 'personal' | null;
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

function formatClockMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')}${hour24 >= 12 ? 'p' : 'a'}`;
}

function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function formatFlightDetailLabel(detail: { starts_at: string | null; ends_at: string | null } | undefined): string | null {
  if (!detail) return null;
  const clock = (value: string | null) => {
    const match = value?.match(/T(\d{2}:\d{2})/);
    return match?.[1] ? fmtClock(match[1]) : null;
  };
  const departure = clock(detail.starts_at);
  const arrival = clock(detail.ends_at);
  const parts = [
    departure ? `Depart ${departure}` : null,
    arrival ? `Arrive ${arrival}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
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
  tripName: string;
  tripDays: TripDay[];
  jobs: Job[];
  dayLabel: string;
  dayIndex: number;
  dayCount: number;
  driveFromPrevMins: number | null;
  driveFromPrevLabel: string | null;
  conflict: boolean;
  dayFitLabel: string | null;
  dayStartMins: number;
  dayEndMins: number;
  biasLat?: number | null;
  biasLng?: number | null;
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
    tripName,
    tripDays,
    jobs,
    dayLabel,
    dayIndex,
    dayCount,
    driveFromPrevMins,
    driveFromPrevLabel,
    conflict,
    dayFitLabel,
    dayStartMins,
    dayEndMins,
    biasLat,
    biasLng,
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
  const dialogRef = useDialogA11y<HTMLDivElement>(() => {
    commit();
    onClose();
  });

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

    const schedule = presenceToSchedule({
      presence,
      durationMins,
      fixedTime: fixedTime || null,
      dayStartMins,
      dayEndMins,
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
      <div
        ref={dialogRef}
        className="capture-sheet task-detail-sheet stop-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit stop: ${a.text}`}
      >
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

        <ContextLine
          className="travel-stop-identity-line"
          label="Trip, day, and stop"
          items={[
            { label: tripName || 'Trip' },
            { label: `Day ${dayIndex} of ${dayCount} · ${dayLabel}` },
            { label: text.trim() || a.text, current: true },
          ]}
        />

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
          biasLat={biasLat}
          biasLng={biasLng}
          radiusMeters={5000}
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
  const { entitlements, loading: entLoading } = useEntitlements(session?.user?.id);
  const canTravel = entitlements.canUseTravel;
  useProRedirect(!entLoading && Boolean(session), canTravel, 'travel');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripDays, setTripDays] = useState<TripDay[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [flightDetailsByActivity, setFlightDetailsByActivity] = useState<Record<string, { starts_at: string | null; ends_at: string | null }>>({});
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
  const [now, setNow] = useState(new Date());
  const [recalculating, setRecalculating] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [savingDateRange, setSavingDateRange] = useState(false);
  const [offlineView, setOfflineView] = useState(false);

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [accommodationSheetOpen, setAccommodationSheetOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [captureMoreOpen, setCaptureMoreOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureDialogRef = useDialogA11y<HTMLDivElement>(closeCapture);
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
  const [dayMeetings, setDayMeetings] = useState<
    Array<{ id: string; text: string; startAt: string | null; durationMins?: number }>
  >([]);
  const dayMeetingCount = dayMeetings.length;
  const dayStripRef = useRef<HTMLDivElement | null>(null);
    const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const [captureTimeType, setCaptureTimeType] = useState<'flexible' | 'fixed'>('flexible');
  const [captureFixedTime, setCaptureFixedTime] = useState('');
  const [captureStopKind, setCaptureStopKind] = useState<StopKind>('leisure');
  const [capturePresence, setCapturePresence] = useState<StopPresence>('duration');
  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [captureEngineMsg, setCaptureEngineMsg] = useState<string | null>(null);
  const [priorTravelRequest, setPriorTravelRequest] = useState<EngineRequest | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    setOfflineView(typeof navigator !== 'undefined' && navigator.onLine === false);
    return subscribeOnline((online) => setOfflineView(!online));
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    registerTravelSyncHandler();
    return startSyncOnReconnect(session.user.id);
  }, [session?.user?.id]);

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
    const userId = session?.user?.id;
    if (!userId) return;
    const { data: tripRow, error: tripError } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    const { data: dayRows, error: daysError } = await supabase
      .from('trip_days').select('*').eq('trip_id', tripId).order('date', { ascending: true });

    if (!tripError && !daysError && !tripRow) {
      setTrip(null);
      setTripDays([]);
      setActivities([]);
      setError('This trip could not be found.');
      return;
    }

    if (tripError || daysError || !dayRows) {
      const cached = loadCachedTravelSnapshot(userId, tripId);
      if (cached?.trip && cached.tripDays.length) {
        setTrip(cached.trip as unknown as Trip);
        setTripDays(cached.tripDays as unknown as TripDay[]);
        const cachedSelected = cached.selectedDayId && cached.tripDays.some((day) => day.id === cached.selectedDayId)
          ? cached.selectedDayId
          : (cached.tripDays[cached.tripDays.length - 1]?.id as string | undefined) ?? null;
        setSelectedDayId(cachedSelected);
        setOfflineView(true);
        return;
      }
      if (tripError || daysError) setError('Trip is not reachable and no saved copy is available on this device.');
      return;
    }

    setTrip(tripRow);
    setTripDays(dayRows || []);
    const todayStr = localDateISO();
    const initialDay = selectInitialTripDay(dayRows as TripDay[], todayStr);
    const selected = initialDay?.id ?? dayRows[dayRows.length - 1]?.id ?? null;
    setSelectedDayId(selected);
    cacheTravelSnapshot(userId, {
      id: tripId,
      trip: tripRow as unknown as Record<string, unknown>,
      tripDays: dayRows as unknown as Array<Record<string, unknown>>,
      selectedDayId: selected,
      activitiesByDay: loadCachedTravelSnapshot(userId, tripId)?.activitiesByDay ?? {},
    });
    setOfflineView(false);

    const { data: settings } = await supabase
      .from('user_settings').select('travel_sort_mode').eq('user_id', userId).maybeSingle();
    if (settings?.travel_sort_mode) setTravelSortMode(settings.travel_sort_mode as TravelSortMode);
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
    const userId = session?.user?.id;
    const { data, error: activitiesError } = await supabase
      .from('activities').select('*').eq('trip_day_id', dayId).neq('status', 'done').order('order_index', { ascending: true });
    if (activitiesError || !data) {
      const cached = userId ? loadCachedTravelSnapshot(userId, tripId) : null;
      const cachedRows = (cached?.activitiesByDay?.[dayId] || []) as unknown as Activity[];
      setActivities(cachedRows.filter((activity) => activity.status !== 'done'));
      setOfflineView(true);
      return;
    }
    const rows = userId
      ? reconcileCachedTravelDay(userId, tripId, dayId, data as unknown as Array<Record<string, unknown>>) as unknown as Activity[]
      : data as Activity[];
    setActivities(rows);
    const flightIds = rows.filter((activity) => activity.activity_type === 'flight').map((activity) => activity.id);
    if (flightIds.length === 0) {
      setFlightDetailsByActivity({});
    } else {
      const { data: flightDocs } = await supabase
        .from('travel_documents')
        .select('activity_id,starts_at,ends_at')
        .eq('doc_type', 'flight')
        .in('activity_id', flightIds);
      const next: Record<string, { starts_at: string | null; ends_at: string | null }> = {};
      for (const doc of flightDocs || []) {
        if (doc.activity_id && !next[doc.activity_id]) {
          next[doc.activity_id] = { starts_at: doc.starts_at, ends_at: doc.ends_at };
        }
      }
      setFlightDetailsByActivity(next);
    }
  }

  async function refreshSelectedDay() {
    if (!selectedDayId) return;
    const { data } = await supabase.from('trip_days').select('*').eq('id', selectedDayId).maybeSingle();
    if (data) {
      setTripDays((prev) => prev.map((d) => (d.id === data.id ? data : d)));
    }
  }

  async function saveTripDateRange(startDate: string, endDate: string) {
    if (!session?.user?.id || !trip) throw new Error('Sign in before changing trip dates.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Trip date changes need a connection. Your saved plan has not been changed.');
    setSavingDateRange(true);
    try {
      let result = await authedFetch(`/api/travel/${tripId}/date-range`, {
        startDate, endDate, confirmOrphans: false,
      });
      if (result?.requiresConfirmation) {
        const count = Number(result.orphanedCount || 0);
        const days = Number(result.removedDayCount || 0);
        const confirmationKey = String(result.confirmationKey || '');
        const confirmed = window.confirm(
          `This change removes ${days} day(s); ${count} stop(s) need a new day. Dokkit will move those stops to the nearest remaining day and preserve them; no stop will be deleted. Continue?`
        );
        if (!confirmed) return;
        result = await authedFetch(`/api/travel/${tripId}/date-range`, {
          startDate, endDate, confirmOrphans: true, confirmedPlanKey: confirmationKey,
        });
      }
      if (result?.error) throw new Error(result.error);
      setDateRangeOpen(false);
      await loadTrip();
      const dayIds = Array.isArray(result?.recalculateDayIds) ? result.recalculateDayIds as string[] : [];
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        await Promise.all(dayIds.map((trip_day_id) => authedFetch('/api/travel/calculate-day', { trip_day_id })));
      }
      if (result?.movedActivityCount) {
        alert(`Trip dates saved. ${result.movedActivityCount} stop(s) were preserved on remaining days.`);
      }
    } finally {
      setSavingDateRange(false);
    }
  }



  async function recalculateDay(dayIdOverride?: string) {
    const dayId = dayIdOverride || selectedDayId;
    if (!dayId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setRecalcError(null); return; }
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
    if (text.length === 0 || !selectedDayId || !session || !trip) return;

    const travelCtx = buildTravelEngineContext({
      tripId: trip.id,
      tripName: trip.name,
      intent: trip.intent ?? 'work',
      flightScheduled: activities.some((activity) => activity.activity_type === 'flight'),
      day: selectedDay
        ? {
            id: selectedDay.id,
            date: selectedDay.date,
            day_start: selectedDay.day_start,
            day_end: selectedDay.day_end,
            arrival_time: selectedDay.arrival_time,
            departure_time: selectedDay.departure_time,
            base_location_text: selectedDay.base_location_text,
            drive_from_base_mins: selectedDay.drive_from_base_mins,
          }
        : null,
      activities: activities.map((a) => ({
        estimateMins: a.estimate_mins,
        driveMinsToNext: a.drive_mins_to_next,
        status: a.status,
      })),
    });

    const prior =
      priorTravelRequest ?? loadPriorForDock(session.user.id);
    const dock = runCaptureDock({
      line: text,
      userId: session.user.id,
      priorRequest: prior,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        locationText: j.location_text ?? null,
      })),
      captureJobId: captureJobId,
      captureSurfaceDate: selectedDay?.date || new Date().toISOString().slice(0, 10),
      remainingMinsToday: travelCtx.remainingMins,
      openTaskCount: activities.filter((a) => a.status === 'pending').length,
      inputType: 'text',
      travelMins: selectedDay?.drive_from_base_mins ?? null,
      visitDurationMins: parseMins(captureEstimate) ?? 30,
      interfaceName: 'travel',
      meetings: dayMeetings,
      travel: {
        tripId: travelCtx.tripId,
        tripName: travelCtx.tripName,
        intent: travelCtx.intent,
        dayId: travelCtx.dayId,
        dayDate: travelCtx.dayDate,
        dayStartMins: travelCtx.dayStartMins,
        dayEndMins: travelCtx.dayEndMins,
        baseLocationText: travelCtx.baseLocationText,
        activityCount: travelCtx.activityCount,
        plannedMins: travelCtx.plannedMins,
        remainingMins: travelCtx.remainingMins,
        driveFromBaseMins: travelCtx.driveFromBaseMins,
      },
    });

    const dockOutcome = classifyCaptureDockOutcome(dock);
    if (!allowCreate('explicit_create', dockOutcome.class)) {
      setCaptureEngineMsg(dockOutcome.message);
      setError(dockOutcome.message || 'Resolve this before adding a stop.');
      return;
    }

    if (dock.kind === 'answer' || dock.kind === 'defer' || dock.kind === 'clarify') {
      // Explicit Add stop is write intent: engine commentary remains visible,
      // but cannot veto the stop. Required travel fields are checked below.
      setCaptureEngineMsg(dock.message);
      setPriorTravelRequest(dock.request);
      setError('');
    }

    if (dock.kind === 'act_create' || dock.kind === 'act_update') {
      setPriorTravelRequest(dock.request);
      // Apply engine-interpreted title / location when user left fields sparse
      if (dock.overrides.text && dock.overrides.text !== text) {
        // keep user text as stop label unless empty object path — prefer user captureText
      }
      if (!captureLocation.trim() && dock.overrides.locationText) {
        setCaptureLocation(dock.overrides.locationText);
      }
      if (!captureJobId && dock.overrides.jobId) {
        setCaptureJobId(dock.overrides.jobId);
      }
      if (dock.message) setCaptureEngineMsg(dock.message);
    }

    if (captureStopKind === 'work' && !captureJobId && !captureLocation.trim()) {
      // After engine pass, re-check with possible job from dock
      const engineJob = dock.kind === 'act_create' || dock.kind === 'act_update' ? dock.overrides.jobId : null;
      if (!engineJob && !captureLocation.trim()) {
        setError('Link a job or set a location for this work site');
        return;
      }
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

    if (!selectedDay) {
      setError('Select a trip day first');
      return;
    }
    const dayAnchor = resolveScheduledDayAnchor(
      selectedDay,
      activities.some((activity) => activity.activity_type === 'flight')
    );
    const dayStart = dayAnchor.windowStartMins;
    const dayEnd = dayAnchor.windowEndMins;

    const schedule = presenceToSchedule({
      presence: capturePresence,
      durationMins,
      fixedTime: captureFixedTime || null,
      dayStartMins: dayStart,
      dayEndMins: dayEnd,
    });

    // Prefer job name when work-linked and title empty of place
    let stopText = text;
    const effectiveJobId =
      captureJobId ||
      (dock.kind === 'act_create' || dock.kind === 'act_update'
        ? dock.overrides.jobId
        : null);
    if (captureStopKind === 'work' && effectiveJobId) {
      const job = jobs.find((j) => j.id === effectiveJobId);
      if (job && (text === job.name || text.length === 0)) stopText = job.name;
    }
    // Engine object text when utterance was a richer phrase
    if (
      (dock.kind === 'act_create' || dock.kind === 'act_update') &&
      dock.overrides.text &&
      dock.overrides.text.length > 0 &&
      dock.overrides.text.length < text.length + 40
    ) {
      // Prefer structured engine title when it looks cleaner
      const eng = dock.overrides.text.trim();
      if (eng && !/\b(have i|do i|can i)\b/i.test(eng)) {
        stopText = eng;
      }
    }

    setError('');
    const maxOrder = activities.reduce((m, a) => Math.max(m, a.order_index), 0);

    let loc =
      captureLocation.trim() ||
      (dock.kind === 'act_create' || dock.kind === 'act_update'
        ? dock.overrides.locationText
        : null) ||
      null;
    let lat = captureCoords?.lat ?? null;
    let lng = captureCoords?.lng ?? null;
    if (captureStopKind === 'work' && effectiveJobId) {
      const job = jobs.find((j) => j.id === effectiveJobId);
      if (job) {
        if (!loc && job.location_text) loc = job.location_text;
        if (lat == null && job.lat != null) {
          lat = job.lat;
          lng = job.lng;
        }
      }
    }

    const created: Activity = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16); }),
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
      status: 'pending',
      time_type: schedule.time_type,
      fixed_time: schedule.fixed_time,
      route_polyline: null,
      stop_kind: captureStopKind,
      presence: capturePresence,
      job_id: captureStopKind === 'work' ? effectiveJobId : null,
    } as Activity;
    queueTravelMutation(session.user.id, 'upsert', created as unknown as Record<string, unknown>);
    const nextActivities = [...activities, created];
    setActivities(nextActivities);
    cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
    setCaptureText('');
    setCaptureLocation('');
    setCaptureCoords(null);
    setCaptureEstimate('30m');
    setCaptureTimeType('flexible');
    setCaptureFixedTime('');
    setCaptureStopKind('leisure');
    setCapturePresence('duration');
    setCaptureJobId(null);
    setCaptureEngineMsg(null);
    setCaptureOpen(false);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const sync = await flushSyncQueue(session.user.id);
      if (sync.failed === 0 && created.lat != null) await recalculateDay();
    }
  }

  function closeCapture() {
    setCaptureOpen(false);
    setError('');
    setCaptureEngineMsg(null);
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
    const patch = {
      id, text, estimate_mins: estimateMins, location_text: location || null, lat, lng,
      time_type: timeType, fixed_time: fixedTime, stop_kind: stopKind, presence, job_id: jobId,
    };
    if (!session?.user?.id) return;
    queueTravelMutation(session.user.id, 'update', patch);
    const nextActivities = activities.map((row) => row.id === id ? { ...row, ...patch } as Activity : row);
    setActivities(nextActivities);
    if (selectedDayId) cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const sync = await flushSyncQueue(session.user.id);
      if (sync.failed === 0) await recalculateDay();
    } else {
      recalculateDay();
    }
  }

  async function completeActivity(id: string) {
    const activity = activities.find((a) => a.id === id);
    if (!session?.user?.id || !activity) return;
    queueTravelMutation(session.user.id, 'update', { id, status: 'done' });
    const nextActivities = activities.filter((a) => a.id !== id);
    setActivities(nextActivities);
    if (selectedDayId) cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const sync = await flushSyncQueue(session.user.id);
      if (sync.failed === 0) await recalculateDay();
    } else {
      recalculateDay();
    }
    // Ambient reality: duration-style stops contribute when estimate is real.
    // Presence blocks (all_day / work_hours) are capacity signals, not timer actuals.
    if (activity && session?.user?.id && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
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
    const activity = activities.find((item) => item.id === id);
    const clearAnchorPatch: Record<string, null> = {};

    if (activity?.activity_type === 'flight' && selectedDay) {
      const { data: linkedDocs } = await supabase
        .from('travel_documents')
        .select('doc_type,starts_at,ends_at')
        .eq('activity_id', id);
      const flightDoc = (linkedDocs || []).find((doc: { doc_type: string }) => doc.doc_type === 'flight');
      const arrivalClock = flightDoc?.ends_at?.match(/T(\\d{2}:\\d{2})/)?.[1] || null;
      const departureClock = flightDoc?.starts_at?.match(/T(\\d{2}:\\d{2})/)?.[1] || null;

      if (selectedDay.arrival_time && arrivalClock === selectedDay.arrival_time) {
        if (confirm('This flight set the arrival anchor for this day. Clear that anchor too? Choose Cancel to keep it as a manual anchor.')) {
          clearAnchorPatch.arrival_time = null;
        }
      }
      if (selectedDay.departure_time && departureClock === selectedDay.departure_time) {
        if (confirm('This flight set the departure anchor for this day. Clear that anchor too? Choose Cancel to keep it as a manual anchor.')) {
          clearAnchorPatch.departure_time = null;
        }
      }
    }

    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      alert('Could not delete the stop: ' + error.message);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    if (selectedDay && Object.keys(clearAnchorPatch).length) {
      const { error: anchorError } = await supabase.from('trip_days').update(clearAnchorPatch).eq('id', selectedDay.id);
      if (anchorError) alert('Flight deleted, but the day anchor could not be cleared: ' + anchorError.message);
      else await refreshSelectedDay();
    }
    recalculateDay();
  }

  async function moveActivityToDay(id: string, newTripDayId: string) {
    if (!session?.user?.id) return;
    const activity = activities.find((item) => item.id === id);
    if (!activity || newTripDayId === activity.trip_day_id) return;
    const snapshot = loadCachedTravelSnapshot(session.user.id, tripId);
    let targetActivities = (snapshot?.activitiesByDay?.[newTripDayId] || []) as unknown as Activity[];
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const { data } = await supabase.from('activities').select('*').eq('trip_day_id', newTripDayId).neq('status', 'done').order('order_index', { ascending: true });
      if (data) targetActivities = data as Activity[];
    }
    const sourceActivities = activities.filter((item) => item.id !== id).map((item, index) => ({ ...item, order_index: index, drive_mins_to_next: 0, route_polyline: null }));
    const moved = { ...activity, trip_day_id: newTripDayId, order_index: targetActivities.length, drive_mins_to_next: 0, route_polyline: null };
    queueTravelMutation(session.user.id, 'update', { id, trip_day_id: newTripDayId, order_index: moved.order_index, drive_mins_to_next: 0, route_polyline: null });
    sourceActivities.forEach((item) => queueTravelMutation(session.user.id, 'update', { id: item.id, order_index: item.order_index, drive_mins_to_next: 0, route_polyline: null }));
    const reindexedTargetActivities = targetActivities.filter((item) => item.id !== id).map((item, index) => ({ ...item, order_index: index, drive_mins_to_next: 0, route_polyline: null }));
    reindexedTargetActivities.forEach((item) => queueTravelMutation(session.user.id, 'update', { id: item.id, order_index: item.order_index, drive_mins_to_next: 0, route_polyline: null }));
    setActivities(sourceActivities);
    cacheTravelDayActivities(session.user.id, tripId, activity.trip_day_id, sourceActivities as unknown as Array<Record<string, unknown>>);
    cacheTravelDayActivities(session.user.id, tripId, newTripDayId, [...reindexedTargetActivities, moved] as unknown as Array<Record<string, unknown>>);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const result = await flushSyncQueue(session.user.id);
      if (result.failed === 0) {
        await Promise.all([activity.trip_day_id, newTripDayId].map((trip_day_id) => authedFetch('/api/travel/calculate-day', { trip_day_id })));
        await loadActivities();
      }
    }
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

    const byId: Record<string, Activity> = {};
    activities.forEach((activity) => { byId[activity.id] = activity; });
    const reindexed = newOrderIds.filter((activityId) => byId[activityId]).map((activityId, index) => ({ ...byId[activityId], order_index: index, drive_mins_to_next: 0, route_polyline: null }));
    const others = activities.filter((activity) => !newOrderIds.includes(activity.id));
    const nextActivities = [...reindexed, ...others];
    setActivities(nextActivities);
    if (session?.user?.id && selectedDayId) {
      reindexed.forEach((activity) => queueTravelMutation(session.user.id, 'update', { id: activity.id, order_index: activity.order_index, drive_mins_to_next: 0, route_polyline: null }));
      cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const result = await flushSyncQueue(session.user.id);
        if (result.failed === 0) {
          await authedFetch('/api/travel/calculate-day', { trip_day_id: selectedDayId });
          await recalculateDay();
        }
      }
    }
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

  async function addFoundPlace(place: { name: string; address: string; lat: number; lng: number }, insertIndex: number | null) {
    if (!selectedDayId || !session?.user?.id) return;
    const slot = insertIndex == null ? activities.length : insertIndex;
    const order = buildInsertionOrder(activities, slot);
    order.updates.forEach((item) => queueTravelMutation(session.user.id, 'update', { id: item.id, order_index: item.order_index }));
    const created: Activity = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16); }),
      user_id: session.user.id, trip_day_id: selectedDayId, text: place.name, activity_type: 'stop',
      estimate_mins: 30, drive_mins_to_next: 0, location_text: place.address, lat: place.lat, lng: place.lng,
      order_index: order.insertOrderIndex, time_type: 'flexible', fixed_time: null, stop_kind: 'leisure',
      presence: 'duration', job_id: null, status: 'pending', route_polyline: null,
    } as Activity;
    queueTravelMutation(session.user.id, 'upsert', created as unknown as Record<string, unknown>);
    const orderById = new Map(order.updates.map((item) => [item.id, item.order_index]));
    const nextActivities = [...activities.map((activity) => ({ ...activity, order_index: orderById.get(activity.id) ?? activity.order_index })), created]
      .sort((a, b) => a.order_index - b.order_index);
    setActivities(nextActivities);
    cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const sync = await flushSyncQueue(session.user.id);
      if (sync.failed === 0) await recalculateDay();
    }
    setNearbyOpen(false);
    setNearbyLeg(null);
  }

  async function findNearby(leg: Leg) {
    setNearbyLeg(leg);
    setNearbyInsertIndex(leg.insertIndex);
    const fromAct = leg.fromId ? activities.find((x) => x.id === leg.fromId) : null;
    const toAct = activities.find((x) => x.id === leg.toId);
    const toName = toAct?.location_text || toAct?.text || 'the next stop';
    setNearbyContext(fromAct
      ? `On the way from ${fromAct.location_text || fromAct.text} to ${toName}`
      : `On the way from ${selectedDay?.base_location_text || 'your base'} to ${toName}`);
    setNearbyOpen(true);
  }

  function handleCategoryChange(category: string) {
    setNearbyCategory(category);
    if (nearbyLeg) runNearbySearch(nearbyLeg, category);
  }

  async function insertNearbySuggestion(s: NearbySuggestion) {
    if (!selectedDayId || !session || nearbyInsertIndex === null) return;
    setNearbyOpen(false);

    const created: Activity = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16); }),
      user_id: session.user.id, trip_day_id: selectedDayId, text: s.name, activity_type: 'stop',
      estimate_mins: 30, drive_mins_to_next: 0, location_text: s.address, lat: s.lat, lng: s.lng,
      order_index: nearbyInsertIndex, status: 'pending', time_type: 'flexible', fixed_time: null,
      route_polyline: null, stop_kind: 'leisure', presence: 'duration', job_id: null,
    } as Activity;
    const currentIds = activities.map((activity) => activity.id);
    const newOrderIds = [...currentIds];
    newOrderIds.splice(nearbyInsertIndex, 0, created.id);
    newOrderIds.forEach((activityId, index) => {
      if (activityId === created.id) return;
      queueTravelMutation(session.user.id, 'update', { id: activityId, order_index: index });
    });
    created.order_index = newOrderIds.indexOf(created.id);
    queueTravelMutation(session.user.id, 'upsert', created as unknown as Record<string, unknown>);
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const nextActivities = newOrderIds.map((activityId, index) => activityId === created.id ? created : { ...byId.get(activityId)!, order_index: index });
    setActivities(nextActivities);
    cacheTravelDayActivities(session.user.id, tripId, selectedDayId, nextActivities as unknown as Array<Record<string, unknown>>);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      const sync = await flushSyncQueue(session.user.id);
      if (sync.failed === 0) await recalculateDay();
    }
  }

  const hasScheduledFlight = activities.some((activity) => activity.activity_type === 'flight');
  const dayAnchor = resolveScheduledDayAnchor(selectedDay ?? {}, hasScheduledFlight);
  const dayStartMinutes = selectedDay ? dayAnchor.windowStartMins : 0;
  const dayEndMinutes = selectedDay ? dayAnchor.windowEndMins : 0;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();

  const todayStr = localDateISO(now);
  const isToday = selectedDay?.date === todayStr;
  const minutesLeftToday = isToday ? Math.max(dayEndMinutes - Math.max(nowMinutesOfDay, dayStartMinutes), 0) : Math.max(dayEndMinutes - dayStartMinutes, 0);

  const driveFromBase = selectedDay?.drive_from_base_mins || 0;
  const plannedMins = driveFromBase + activities.reduce((sum, a) => sum + a.estimate_mins + a.drive_mins_to_next, 0);
  const overloaded = minutesLeftToday > 0 && plannedMins > minutesLeftToday;
  const spareMins = minutesLeftToday - plannedMins;

  const trackSpan = Math.max(dayEndMinutes - dayStartMinutes, 1);
  const nowPercent = isToday ? Math.min(Math.max((nowMinutesOfDay - dayStartMinutes) / trackSpan, 0), 1) : 0;
  const projectedFinish = (isToday ? Math.max(nowMinutesOfDay, dayStartMinutes) : dayStartMinutes) + plannedMins;
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
  const unverifiableFixedTimes = useMemo(
    () => findUnverifiableFixedTimeStops(
      sortedActivities as any,
      !!selectedDay && selectedDay.base_lat != null && selectedDay.base_lng != null && (selectedDay.drive_from_base_mins || 0) <= 0,
    ),
    [sortedActivities, selectedDay],
  );


  // Meetings on selected trip day — full rows for capacity ANSWER + count for UI.
  useEffect(() => {
    if (!session?.user?.id || !selectedDay?.date) {
      setDayMeetings([]);
      return;
    }
    const uid = session.user.id;
    const dateStr = selectedDay.date;
    let cancelled = false;
    void (async () => {
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59.999`;
      const { data } = await supabase
        .from('meetings')
        .select('id, text, start_time, duration_mins')
        .eq('user_id', uid)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time', { ascending: true })
        .limit(20);
      if (cancelled) return;
      const rows = (data || []).map(
        (m: { id: string; text: string; start_time: string | null; duration_mins?: number }) => ({
          id: m.id,
          text: m.text,
          startAt: m.start_time,
          durationMins: m.duration_mins ?? 45,
        })
      );
      setDayMeetings(rows);
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

  if (session && (entLoading || !canTravel)) {
    return (
      <div className="app-shell">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`app-shell${isDesktop ? ' desk-trip-detail' : ''}`}>
      <div className="app-header travel-detail-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/travel')} aria-label="Back to travel"><BackIcon /></button>
          <div className="travel-detail-identity">
            <p className="ins-travel-eyebrow">Movement / Trip</p>
            <h1 className="app-title travel-detail-title">{trip.name}</h1>
          </div>
        </div>
      </div>

      {offlineView && (
        <div className="ins-travel-status" role="status" aria-live="polite">
          Offline · showing the last saved trip plan
        </div>
      )}

      {dateRangeOpen && (
        <div className="ins-travel-date-editor">
          <TripDateRangeEditor
            startDate={trip.start_date}
            endDate={trip.end_date}
            saving={savingDateRange}
            onCancel={() => setDateRangeOpen(false)}
            onSave={saveTripDateRange}
          />
        </div>
      )}

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
        <TripDayPanel
          key={selectedDay.id}
          dayLabel={fmtDayLabel(selectedDay.date).weekday}
          dateLabel={fmtDayLabel(selectedDay.date).date}
          dayAnchor={dayAnchor}
          flightScheduled={hasScheduledFlight}
          fitLabel={minutesLeftToday > 0
            ? overloaded ? `Over by ${fmtMins(-spareMins)}` : `Fits · ${fmtMins(Math.max(0, spareMins))} spare`
            : 'Day window passed'}
          conflictCount={Object.values(fixedTimeConflicts).filter(Boolean).length}
          meetingCount={dayMeetingCount}
          daySheetOpen={daySheetOpen}
          onOpenDaySheet={() => setDaySheetOpen(true)}
          onAddStop={() => setCaptureOpen(true)}
          secondary={
            <TravelToolsStrip
              onFindPlace={() => {
                setNearbyLeg(null);
                setNearbyInsertIndex(null);
                setNearbyContext('Find a place to add to this trip day');
                setNearbyOpen(true);
              }}
              onOpenVault={() => setVaultOpen(true)}
              onOpenMap={() => setMapOpen(true)}
              onOpenStay={() => setAccommodationSheetOpen(true)}
              onEditDates={() => setDateRangeOpen((open) => !open)}
              datesOpen={dateRangeOpen}
              sortLabel={travelSortMode === 'what_fits' ? 'Fit' : travelSortMode === 'close_to_accom' ? 'Near stay' : travelSortMode === 'nearby_me' ? 'Nearby' : 'Manual'}
              onCycleSort={() => {
                const modes: TravelSortMode[] = ['what_fits', 'close_to_accom', 'nearby_me', 'manual'];
                const next = (modes.indexOf(travelSortMode) + 1) % modes.length;
                void changeSortMode(modes[next]);
              }}
              onOpenLibrary={() => setLibraryOpen(true)}
            />
          }
        />
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
            <div className="empty-state-sub">
              Add your first stop — Dokkit works out the route and how the day fits.
            </div>
          </div>
        )}

        {selectedDay && selectedDay.base_location_text && activities.length > 0 && (
          (() => {
            const startLeg = legs.find((l) => l.insertIndex === 0 && l.fromId === null);
            const known = !!startLeg && startLeg.directMins > 0;
            return (
              <TravelLeg
                label={known ? displayDriveEstimate(startLeg!.directMins) : displayDriveEstimate(null)}
                detail={`Drive from ${selectedDay.base_location_text}`}
                action={known ? (
                  <button onClick={() => findNearby(startLeg!)} aria-label="Find something nearby on this drive">
                    <CompassIcon size={12} /> Nearby
                  </button>
                ) : undefined}
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
            <TripStopRow
              key={a.id}
              activity={a}
              flightDetailLabel={a.activity_type === 'flight' ? formatFlightDetailLabel(flightDetailsByActivity[a.id]) : null}
              rowStyle={rowStyle}
              conflict={conflict}
              routeUnverifiable={!!unverifiableFixedTimes[a.id]}
              manualSort={travelSortMode === 'manual'}
              workLabel={a.job_id
                ? `Job · ${jobs.find((job) => job.id === a.job_id)?.name || 'Linked job'}`
                : a.stop_kind === 'work' ? 'Work site' : null}
              driveGlanceLabel={travelSortMode !== 'manual'
                ? (idx < sortedActivities.length - 1 || (idx === sortedActivities.length - 1 && !!selectedDay?.base_location_text) ? 'unknown' : null)
                : legAfterThis
                  ? legAfterThis.directMins > 0 ? displayDriveEstimate(legAfterThis.directMins) : displayDriveEstimate(null)
                  : a.drive_mins_to_next > 0 ? displayDriveEstimate(a.drive_mins_to_next)
                  : idx < sortedActivities.length - 1 || (idx === sortedActivities.length - 1 && !!selectedDay?.base_location_text) ? 'unknown' : null}
              mapsUrl={buildGoogleMapsDirectionsUrl({ lat: a.lat, lng: a.lng, locationText: a.location_text, label: a.text })}
              driveLabel={travelSortMode === 'manual' && legAfterThis && legAfterThis.directMins > 0 ? fmtMins(legAfterThis.directMins) : null}
              driveDetail={travelSortMode === 'manual' && legAfterThis && legAfterThis.directMins > 0
                ? `Drive to ${nextStop?.location_text || nextStop?.text || 'the next stop'}` : null}
              onComplete={() => completeActivity(a.id)}
              onOpen={() => setOpenActivityId(a.id)}
              onNearbyDrive={() => legAfterThis && findNearby(legAfterThis)}
              onPointerDown={(e) => handleDragHandlePointerDown(e, a.id, orderedIds)}
              onPointerMove={handleDragHandlePointerMove}
              onPointerUp={handleDragHandlePointerUp}
              fmtMins={fmtMins}
              fmtClock={fmtClock}
              onRowRef={(el) => { rowElsRef.current[a.id] = el; }}
            />
          );
        })}
      </div>


      {captureOpen && (
        <div className="sheet-backdrop ins-travel-sheet-backdrop" onClick={closeCapture}>
          <div
            ref={captureDialogRef}
            className="capture-sheet ins-travel-capture-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add a trip stop"
          >
            <div className="task-detail-header" style={{ marginBottom: 0 }}>
              <div className="settings-panel-title">Where next?</div>
              <button className="gear-btn" onClick={closeCapture} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ins-ink-soft)', margin: '0 0 12px' }}>
              A place you&apos;ll be — not a task list.
            </p>

            <input
              type="text"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              placeholder="e.g. Supplier drop-off or Henderson site"
              autoFocus
            />
            <LocationAutocomplete
              biasLat={selectedDay?.base_lat}
              biasLng={selectedDay?.base_lng}
              radiusMeters={5000}
              value={captureLocation}
              placeholder="Add location (optional)"
              onChange={setCaptureLocation}
              onPlaceSelected={(result) => {
                setCaptureLocation(result.formattedAddress);
                setCaptureCoords({ lat: result.lat, lng: result.lng });
              }}
            />

            <button
              type="button"
              onClick={() => setCaptureMoreOpen((v) => !v)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--ink-soft)',
                fontSize: 13,
                padding: '8px 0',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {captureMoreOpen ? 'Fewer options ▴' : 'More options ▾'}
            </button>

            {captureMoreOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
                <span className="settings-label">What kind of stop?</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STOP_KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={
                        captureStopKind === opt.value
                          ? 'meeting-pill meeting-pill--primary'
                          : 'meeting-pill'
                      }
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
                  <div>
                    <span className="settings-label">Job (optional)</span>
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

                <span className="settings-label">When are you there?</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={
                        capturePresence === opt.value
                          ? 'meeting-pill meeting-pill--primary'
                          : 'meeting-pill'
                      }
                      onClick={() => setCapturePresence(opt.value)}
                      title={opt.hint}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {(capturePresence === 'duration' || capturePresence === 'fixed') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="settings-label">About</span>
                    <input
                      type="text"
                      value={captureEstimate}
                      onChange={(e) => setCaptureEstimate(e.target.value)}
                      placeholder="30m or 1.5h"
                    />
                  </div>
                )}
                {capturePresence === 'fixed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="settings-label">At</span>
                    <input
                      type="time"
                      value={captureFixedTime}
                      onChange={(e) => setCaptureFixedTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {captureLocation.length > 0 && !captureCoords && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                Pick a suggestion so drive times can be calculated.
              </p>
            )}
            {captureEngineMsg && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--ins-ink)',
                  margin: '8px 0 0',
                  padding: '10px 12px',
                  background: 'var(--ins-paper)',
                  borderRadius: 8,
                  lineHeight: 1.4,
                }}
              >
                {captureEngineMsg}
              </p>
            )}
            {error && <p className="ins-travel-capture-error" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn btn-steel" onClick={addActivity} style={{ marginTop: 8, width: '100%' }}>
              Add stop
            </button>
          </div>
        </div>
      )}

      {openActivity && (
        <ActivityDetailSheet
          activity={openActivity}
          tripName={trip?.name || 'Trip'}
          tripDays={tripDays}
          jobs={jobs}
          dayLabel={
            selectedDay
              ? `${fmtDayLabel(selectedDay.date).weekday} ${fmtDayLabel(selectedDay.date).date}`
              : 'This day'
          }
          dayIndex={selectedDayIndex >= 0 ? selectedDayIndex + 1 : 1}
          dayCount={tripDays.length}
          dayStartMins={dayStartMinutes}
          dayEndMins={dayEndMinutes}
          biasLat={selectedDay?.base_lat}
          biasLng={selectedDay?.base_lng}
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

      {vaultOpen && session?.user?.id && (
        <TravelVaultSheet
          tripId={tripId}
          tripName={trip.name}
          userId={session.user.id}
          tripDays={tripDays.map((d) => ({ id: d.id, date: d.date }))}
          onClose={() => setVaultOpen(false)}
          onItineraryChanged={async ({ tripDayId, dayDate }) => {
            setSelectedDayId(tripDayId);
            await loadActivities(tripDayId);
            // surface date if user jumped days
            void dayDate;
          }}
        />
      )}

      {nearbyOpen && (
        <FindPlaceSheet
          onClose={() => setNearbyOpen(false)}
          onAddStop={addFoundPlace}
          insertIndex={nearbyInsertIndex}
          initialBias={nearbyLeg ? 'leg' : 'stay'}
          contextLabel={nearbyContext || undefined}
          remainingMins={minutesLeftToday}
          contexts={(() => {
            const from = nearbyLeg?.fromId ? activities.find((a) => a.id === nearbyLeg.fromId) : null;
            const to = nearbyLeg ? activities.find((a) => a.id === nearbyLeg.toId) : null;
            const focus = openActivity || to || from || activities.find((a) => a.lat != null && a.lng != null);
            const contexts: PlaceBiasContexts = {};
            if (selectedDay?.base_lat != null && selectedDay.base_lng != null) contexts.stay = { lat: selectedDay.base_lat, lng: selectedDay.base_lng };
            if (focus?.lat != null && focus.lng != null) contexts.stop = { lat: focus.lat, lng: focus.lng };
            if (to?.lat != null && to.lng != null) contexts.next = { lat: to.lat, lng: to.lng };
            if (nearbyLeg) contexts.leg = { lat: (nearbyLeg.fromLat + nearbyLeg.toLat) / 2, lng: (nearbyLeg.fromLng + nearbyLeg.toLng) / 2 };
            return contexts;
          })()}
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


      <SurfaceNav active="travel" />
    </div>
  );
}
