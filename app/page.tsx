'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';
import { TaskCard } from '@/components/TaskCard';
import { TravelLeg } from '@/components/TravelLeg';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { ScheduledSheet } from '@/components/ScheduledSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import { TodayHeader } from '@/components/TodayHeader';
import MapView from '@/components/MapView';
import SurfaceNav from '@/components/SurfaceNav';
import { AuthScreen, OnboardingScreen } from '@/components/AuthScreen';
import { PlusIcon, StopIcon } from '@/components/icons';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import {
  buildClusters,
  suggestEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
  suggestLocation,
  suggestsLocation,
  suggestJob,
  suggestLocationMemory,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { logCapturePrediction, logCompletionOutcome } from '@/lib/thinking/evidence/predictionLog';
import { decidePersonalGravity, LOOKBACK_DAYS } from '@/lib/thinking/decisions/personalGravity';
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import { resolveJobAndLocation, type JobLocationResolution, type JobLocationCandidate } from '@/lib/unifiedInput/resolve';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import type { SurfaceEvent, Surface } from '@/lib/thinking/types';
import { determineBase, nearestNeighborOrder, weaveGeoOrder, type Coords } from '@/lib/todayRoute';
import { sortTasks } from '@/lib/taskSort';
import { authedFetch, apiUrl } from '@/lib/authedFetch';
import {
  HAS_SIGNED_IN_KEY,
  INITIALIZED_FOR_KEY,
  DEFAULT_WORK_DAYS,
  type Meeting,
  type SortMode,
  type Subtask,
  type Task,
} from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import {
  fmtMins,
  isScheduledForLater,
  localDateStr,
  parseMins,
  timeStringToMinutes,
} from '@/lib/timeFormat';

// One-shot browser geolocation for the route's start point. Resolves to
// null when the API is unavailable, permission is denied, or the fix
// doesn't arrive in time — the caller then falls back to Home/Work.
function getGpsPosition(timeoutMs = 4000): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

// Explicit column list for Today's task reads — everything the Task type
// and its consumers (cards, detail sheet, drag reorder, sorting) actually
// use. Keeps polylines and coordinates while skipping bookkeeping columns
// (notification flags, timestamps) Today never reads.
const TASK_COLUMNS =
  'id, text, status, source, estimate_mins, logged_mins, started_at, due_today, order_index, created_at, surface_date, intended_time, location_text, lat, lng, drive_mins_to_next, route_polyline, info, job_id, original_input';

// sessionStorage flag: the passive "landed on Today" surface event is the
// same exposure for every mount in one browser session, so it is recorded
// at most once per session. Deliberate navigation always records.
const PASSIVE_TODAY_KEY = 'dokkit-passive-today-recorded';

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [hasSignedInBefore, setHasSignedInBefore] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduledSheetOpen, setScheduledSheetOpen] = useState(false);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS);
  const [sortMode, setSortMode] = useState<SortMode>('capacity_first');
  const [captureOpen, setCaptureOpen] = useState(false);

  // ── Home & Work base pins, and the route state geo_aware sort mode
  // depends on. driveFromBaseMins/basePolyline are never persisted —
  // there's no per-day table for Today the way Travel has trip_days, so
  // these are recomputed fresh each time recalcRoute() runs and held only
  // in memory, same tradeoff flagged when this was designed.
  const [homeLocation, setHomeLocation] = useState('');
  const [homeCoords, setHomeCoords] = useState<Coords | null>(null);
  const [workLocation, setWorkLocation] = useState('');
  const [workCoords, setWorkCoords] = useState<Coords | null>(null);
  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null);
  const [driveFromBaseMins, setDriveFromBaseMins] = useState(0);
  const [basePolyline, setBasePolyline] = useState<string | null>(null);
  // Where the final leg returns to, decided server-side from the predicted
  // arrival vs the workday end — 'Work', 'Home', or the origin fallback
  // label. Rendered as "→ Work" / "→ Home" on the final leg row.
  const [returnLabel, setReturnLabel] = useState<string | null>(null);
  const [recalculatingRoute, setRecalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  // Gates the first-run welcome/setup screen. Starts false so returning
  // users never see a flash of it before settings load.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardSaving, setOnboardSaving] = useState(false);

  const [taskText, setTaskText] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [showReminderField, setShowReminderField] = useState(false);
  const [captureSurfaceDate, setCaptureSurfaceDate] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureLocationCoords, setCaptureLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualLocationToggle, setManualLocationToggle] = useState(false);
  // The optional Job a captured Task should be filed under, chosen from the
  // capture sheet's quiet "Add to a job" disclosure. Null = not in any Job.
  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  // Unified Thought Input V1: the live interpretation of the capture text and
  // the job/location resolution. `thought` holds the parsed action/date/time/
  // location hint; `locationResolution` is the discrete proposed/choose/none
  // outcome over the user's existing jobs. Confirmation state lets the user
  // accept or reject a single plausible candidate (never silently invented).
  const [thought, setThought] = useState<ThoughtParts | null>(null);
  const [locationResolution, setLocationResolution] = useState<JobLocationResolution | null>(null);
  const [intendedTime, setIntendedTime] = useState('');
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<{ text: string; lat: number | null; lng: number | null } | null>(null);
  const [declinedResolution, setDeclinedResolution] = useState(false);

  // Live interpretation of the capture text: re-parse whenever the typed
  // thought or the known jobs change, and recompute the job/location
  // resolution. Confirmation state resets on each text change so an old
  // "yes" never leaks into a new thought.
  useEffect(() => {
    const raw = taskText.trim();
    if (raw.length === 0) {
      setThought(null);
      setLocationResolution(null);
      setIntendedTime('');
      setConfirmedJobId(null);
      setConfirmedLocation(null);
      setDeclinedResolution(false);
      return;
    }
    const parsed = parseThought(raw);
    setThought(parsed);
    setLocationResolution(resolveJobAndLocation(parsed, jobs));
    setIntendedTime(parsed.time ? parsed.time.label : '');
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(false);
  }, [taskText, jobs]);

  // Surfaced in the task list when the tasks query itself fails, so a
  // load failure is never mistaken for "Nothing on your plate yet."
  const [taskLoadError, setTaskLoadError] = useState('');
  const [now, setNow] = useState(new Date());
  const recordEvent = useRecordSurfaceEvent();
  const hasRedirected = useRef(false);
  // Guards Today's data load so it runs once per authenticated user.
  // getSession() and onAuthStateChange's INITIAL_SESSION can both deliver
  // the same session, and background TOKEN_REFRESHED events deliver fresh
  // session objects for the same user — none of that should reload data.
  const loadedUserIdRef = useRef<string | null>(null);
  // Flips true once loadEverything has put the useful UI data (tasks,
  // settings, meetings) in place. The geo_aware auto-route deliberately
  // waits for this: GPS acquisition plus a Directions round-trip must not
  // compete with startup reads or delay first paint of the task list.
  const [todayDataReady, setTodayDataReady] = useState(false);
  // Monotonic token for route recalculations. A new recalc (mode toggle,
  // task edit while routing) supersedes any in-flight one: only the
  // latest call may write route state, so a slow stale response can
  // never overwrite newer results mid-flight.
  const recalcSeqRef = useRef(0);

  // ── Personal Gravity (Scope 3G) ────────────────────────────────
  // Surface events drive the gravity decision — which surface the
  // user naturally gravitates toward. The decision is computed once
  // when the session loads, and a strong preference for a non-Today
  // surface triggers a quiet redirect on initial page load.
  const [surfaceEvents, setSurfaceEvents] = useState<SurfaceEvent[]>([]);
  const gravityDecision = useMemo(
    () => decidePersonalGravity(surfaceEvents),
    [surfaceEvents]
  );

  const { rowElsRef, handleDragHandlePointerDown, handleDragHandlePointerMove, handleDragHandlePointerUp, dragRowStyle } =
    useDragReorder(setTasks);

  // ── The "brain": completed-task history feeds fuzzy clustering, which
  // powers both the capture-time suggestion chip and the capacity math's
  // effective (learned) estimates below. Location suggestions ride the
  // same clusters now — see suggestLocation in taskIntelligence.ts.
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);

  // ── Learned effective estimates, cached per task id ─────────────
  // The one-second clock re-renders Home constantly; suggestEstimate()'s
  // cluster scan must not rerun on every tick. This recomputes only when
  // the underlying tasks, history or clusters change — restoring the
  // caching from 2e2122f that 4ed8ebf reverted. Estimate values and
  // confidence semantics are identical to computing them per render.
  const learnedEffectiveEstimates = useMemo(() => {
    const estimates = new Map<string, number>();

    for (const t of tasks) {
      if (t.estimate_mins <= 0) {
        estimates.set(t.id, t.estimate_mins);
        continue;
      }

      const suggestion = suggestEstimate(t.text, history, clusters);
      estimates.set(t.id, effectiveEstimate(t.estimate_mins, suggestion));
    }

    return estimates;
  }, [tasks, history, clusters]);

  const captureSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestEstimate(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureLocationSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocation(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureJobSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestJob(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureLocationMemorySuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocationMemory(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  // ── Capture context (Scope 3H) ─────────────────────────────────
  // Composes all capture-time signals into a unified context decision.
  // The UI consumes this rather than interpreting individual decisions.
  const captureContext = useMemo(() => {
    const trimmed = taskText.trim();
    return decideCaptureContext({
      surface: 'today',
      currentJobId: captureJobId,
      taskText: trimmed,
      jobDecision: captureJobSuggestion,
      locationDecision: captureLocationMemorySuggestion,
      gravityDecision,
    });
  }, [taskText, captureJobId, captureJobSuggestion, captureLocationMemorySuggestion, gravityDecision]);

  // Deterministic phrase heuristic (see suggestsLocation), not AI — fires
  // the optional location field without forcing it on every task.
  const locationFieldVisible = suggestsLocation(taskText) || captureLocation.length > 0 || manualLocationToggle;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSignedInBefore(window.localStorage.getItem(HAS_SIGNED_IN_KEY) === 'true');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && typeof window !== 'undefined') {
      window.localStorage.setItem(HAS_SIGNED_IN_KEY, 'true');
    }
  }, [session]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Load surface events for Personal Gravity ────────────────────
  // Fetches recent navigation events so the gravity decision can
  // be computed. Also records a passive "landed on Today" event —
  // this is the default surface, so landing here is passive exposure,
  // not active preference. The gravity engine weights this lightly.
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    // Gravity's decision window is LOOKBACK_DAYS and its smallest
    // threshold is 8 events across 3 distinct days — a bounded recent
    // slice covers that without dragging the full event history down on
    // every Today mount.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    supabase
      .from('surface_events')
      .select('id, user_id, surface, active, created_at')
      .eq('user_id', userId)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setSurfaceEvents(data as SurfaceEvent[]);
      });

    // Record passive landing on Today (default surface) once per browser
    // session — flag is set synchronously so concurrent mounts can't
    // double-write.
    let shouldRecord = true;
    try {
      shouldRecord = sessionStorage.getItem(PASSIVE_TODAY_KEY) !== '1';
      if (shouldRecord) sessionStorage.setItem(PASSIVE_TODAY_KEY, '1');
    } catch {}
    if (shouldRecord) recordEvent('today', false);
  }, [session]);

  // ── Personal Gravity redirect ───────────────────────────────────
  // If the engine has strong evidence that the user prefers a
  // different surface, redirect on initial page load. The redirect
  // only fires once per mount — if the user explicitly navigates
  // back to Today, they stay on Today.
  useEffect(() => {
    if (hasRedirected.current) return;
    if (!session) return;
    if (gravityDecision.preferredSurface && gravityDecision.preferredSurface !== 'today' && gravityDecision.authority === 'strong') {
      hasRedirected.current = true;
      const target = gravityDecision.preferredSurface === 'jobs' ? '/jobs' : '/travel';
      router.replace(target);
    }
  }, [session, gravityDecision]);

  useEffect(() => {
    if (!session) {
      loadedUserIdRef.current = null;
      setTodayDataReady(false);
      return;
    }
    if (loadedUserIdRef.current === session.user.id) return;
    loadedUserIdRef.current = session.user.id;
    loadEverything();
  }, [session]);

  async function loadEverything() {
    const userId = session.user.id;

    /*
     * Account initialization is no longer a blocking prerequisite for
     * Today's data — a failure here must never leave an authenticated
     * user staring at "Nothing on your plate yet." It runs once per user
     * per browser: first sign-in awaits it so a brand-new account's
     * settings row exists before the reads below; every later load skips
     * it entirely. A non-403 failure is logged and Today loads anyway;
     * only an explicit "account not active" (403) signs the user out.
     */
    let needsInit = true;
    try {
      needsInit = window.localStorage.getItem(INITIALIZED_FOR_KEY) !== userId;
    } catch {}
    if (needsInit) {
      try {
        const initResponse = await fetch(apiUrl('/api/account/initialize'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!initResponse.ok) {
          const payload = await initResponse.json().catch(() => null);
          const accessError = payload?.error || 'Could not verify account access.';
          if (initResponse.status === 403) {
            setSignInError(accessError);
            await supabase.auth.signOut();
            return;
          }
          console.error('Account initialization failed:', accessError);
        } else {
          try {
            window.localStorage.setItem(INITIALIZED_FOR_KEY, userId);
          } catch {}
        }
      } catch (err) {
        console.error('Account initialization request failed:', err);
      }
    }

    /*
     * Start all independent reads together.
     *
     * Previously these ran sequentially:
     *
     * settings → tasks → meetings → jobs → history
     *
     * That meant every network round-trip added to Today startup time.
     * These requests do not depend on one another, so they can safely
     * run concurrently.
     */

    const settingsPromise = supabase
      .from('user_settings')
      .select(
        'work_start, work_end, work_days, timezone, sort_mode, onboarded, home_location_text, home_lat, home_lng, work_location_text, work_lat, work_lng'
      )
      .eq('user_id', userId)
      .maybeSingle();

    const taskPromise = supabase
      .from('tasks')
      .select(TASK_COLUMNS)
      .neq('status', 'done')
      .order('order_index', { ascending: true });

    // Only today's meetings feed capacity math (plus untimed ones, which
    // Today always counts) — no reason to pull the table's full history.
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const meetingsPromise = supabase
      .from('meetings')
      .select('id, text, duration_mins, start_time')
      .or(
        `start_time.is.null,and(start_time.gte.${dayStart.toISOString()},start_time.lt.${nextDay.toISOString()})`
      );

    // Jobs for the capture sheet's "Add to a job" disclosure — name only.
    const jobsPromise = supabase
      .from('jobs')
      .select('id, name')
      .order('created_at', { ascending: false });

    // Completed-task history for the learning layer.
    // Start this at the same time as the other reads.
    const historyPromise = supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at')
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500);

    /*
     * Tasks are the critical data for Today.
     *
     * As soon as the task request resolves, put the tasks into state.
     * The other requests have already been running in parallel.
     */
    const { data: taskRows, error: taskError } = await taskPromise;
    if (taskError) {
      console.error('Could not load tasks:', taskError.message);
      setTaskLoadError(taskError.message);
    } else {
      setTasks(taskRows || []);
      setTaskLoadError('');
    }

    /*
     * Resolve the other independent requests.
     */
    const [
      { data: settings },
      { data: meetingRows },
      { data: jobRows },
      { data: historyRows },
    ] = await Promise.all([
      settingsPromise,
      meetingsPromise,
      jobsPromise,
      historyPromise,
    ]);

    const detectedTimezone =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null;

    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setWorkDays(
        settings.work_days && settings.work_days.length > 0
          ? settings.work_days
          : DEFAULT_WORK_DAYS
      );
      setSortMode((settings.sort_mode as SortMode) || 'capacity_first');
      setHomeLocation(settings.home_location_text || '');

      if (settings.home_lat != null && settings.home_lng != null) {
        setHomeCoords({
          lat: settings.home_lat,
          lng: settings.home_lng,
        });
      }

      setWorkLocation(settings.work_location_text || '');

      if (settings.work_lat != null && settings.work_lng != null) {
        setWorkCoords({
          lat: settings.work_lat,
          lng: settings.work_lng,
        });
      }

      if (!settings.timezone && detectedTimezone) {
        supabase
          .from('user_settings')
          .update({ timezone: detectedTimezone })
          .eq('user_id', userId);
      }

      // onboarded defaults false on the column; only explicit false shows
      // the welcome screen — anything truthy skips it.
      if (settings.onboarded === false) {
        setShowOnboarding(true);
      }
    }

    setMeetings(meetingRows || []);
    setJobs((jobRows as Job[]) || []);

    /*
     * Subtasks depend on the current task IDs, so this is the one
     * additional request that must wait for the task list.
     */
    if (taskRows && taskRows.length > 0) {
      const ids = taskRows.map((t: Task) => t.id);

      const { data: subRows } = await supabase
        .from('subtasks')
        .select('*')
        .in('task_id', ids)
        .order('order_index', { ascending: true });

      const grouped: Record<string, Subtask[]> = {};

      (subRows || []).forEach((s: Subtask) => {
        if (!grouped[s.task_id]) grouped[s.task_id] = [];
        grouped[s.task_id].push(s);
      });

      setSubtasksByTask(grouped);
    }

    /*
     * History was loaded concurrently with the rest of the initial data.
     * Keep the existing 500-record cap and learning data structure intact.
     */
    setHistory(
      (historyRows || []).map((r: any) => ({
        text: r.text,
        actual_mins: r.actual_mins,
        location_text: r.location_text,
        lat: r.lat,
        lng: r.lng,
        job_id: r.job_id,
        created_at: r.created_at,
      }))
    );

    // The task list, settings and meetings are all in place — the useful
    // UI is rendered from here on, so background work (the geo_aware
    // route calculation) may now start.
    setTodayDataReady(true);
  }

  function toggleWorkDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function handleHomeSelected(result: { formattedAddress: string; lat: number; lng: number }) {
    setHomeLocation(result.formattedAddress);
    setHomeCoords({ lat: result.lat, lng: result.lng });
  }

  function handleWorkSelected(result: { formattedAddress: string; lat: number; lng: number }) {
    setWorkLocation(result.formattedAddress);
    setWorkCoords({ lat: result.lat, lng: result.lng });
  }

  async function completeOnboarding() {
    if (!session) return;
    setOnboardSaving(true);
    const { error } = await supabase
      .from('user_settings')
      .update({
        work_start: workStart, work_end: workEnd, work_days: workDays,
        home_location_text: homeLocation || null, home_lat: homeCoords?.lat ?? null, home_lng: homeCoords?.lng ?? null,
        work_location_text: workLocation || null, work_lat: workCoords?.lat ?? null, work_lng: workCoords?.lng ?? null,
        onboarded: true,
      })
      .eq('user_id', session.user.id);
    setOnboardSaving(false);
    if (error) {
      console.error(error);
      alert('Could not save your setup: ' + error.message);
      return;
    }
    setShowOnboarding(false);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSignInError('Invalid email or password.');
      return;
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setSignInError('Could not send reset email. Please check the email address.');
      return;
    }
    setForgotPasswordSent(true);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSignInError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setSignInError('Could not send a sign-in link. Please check the email address and try again.');
      return;
    }
    setMagicLinkSent(true);
  }

  async function signInWithGoogle() {
    setSigningInWithGoogle(true);
    setSignInError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setSignInError('Failed to sign in with Google.');
      setSigningInWithGoogle(false);
    }
  }

  // Merges the per-task legs the route API persisted straight into local
  // task state — replacing the previous full task refetch after every
  // recalculation. Only the two route fields of ids still present in
  // state are touched, so a task created, edited or completed while
  // routing was in flight is never clobbered by a stale snapshot; it
  // simply keeps its current values until whatever triggered that
  // mutation runs its own recalc.
  function applyRouteLegs(legs: unknown) {
    if (!Array.isArray(legs)) return;
    const legById = new Map<string, { drive_mins_to_next: number; route_polyline: string | null }>();
    for (const leg of legs) {
      const l = leg as { id?: unknown; drive_mins_to_next?: unknown; route_polyline?: unknown };
      if (l && typeof l.id === 'string') {
        legById.set(l.id, {
          drive_mins_to_next: typeof l.drive_mins_to_next === 'number' ? l.drive_mins_to_next : 0,
          route_polyline: typeof l.route_polyline === 'string' ? l.route_polyline : null,
        });
      }
    }
    if (legById.size === 0) return;
    setTasks((prev) => prev.map((t) => (legById.has(t.id) ? { ...t, ...legById.get(t.id)! } : t)));
  }

  // Recomputes the geographic route: nearest-neighbor order from whichever
  // base currently applies (client-side, free), then asks the server to
  // fetch real drive times + route polylines for that exact sequence and
  // persist them. The route's start point is the live GPS fix when the
  // user allows it, with the Home/Work base as the fallback. Only
  // meaningful in geo_aware sort mode — every other mode zeroes the route
  // numbers out, since their ordering isn't geographically guaranteed to
  // make sense (the tension flagged when this was designed).
  async function recalcRoute() {
    if (sortMode !== 'geo_aware' || !session) {
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    const base = determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords);
    if (!base.coords || !base.label) {
      setRouteError('Set a home or work address in Preferences to enable route-aware capacity.');
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    // Must match the exact same set the screen actually displays
    // (visibleTasks below), or the sequence sent to the server won't line
    // up with what weaveGeoOrder() renders — a future-dated reminder with
    // a location would otherwise get folded into the route on the server
    // side while never appearing in the on-screen order, silently
    // shifting which "next stop" each drive_mins_to_next value refers to
    // and making the numbers look wrong for the tasks around it.
    const todayForRoute = localDateStr(now);
    const visibleForRoute = tasks.filter((t) => t.status !== 'done' && !isScheduledForLater(t, todayForRoute));
    const located = visibleForRoute
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ id: t.id, lat: t.lat as number, lng: t.lng as number }));

    if (located.length === 0) {
      setRouteError(null);
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    // Claiming our sequence number up front: any later recalcRoute() call
    // increments past it, and every state write after an await below is
    // skipped once superseded. This also guarantees the recalculating
    // flag is only ever cleared by the newest run — fixing the stuck
    // spinner the old early-return-after-GPS path could leave behind.
    const seq = ++recalcSeqRef.current;

    setRecalculatingRoute(true);
    setRouteError(null);

    try {
      // Ask the browser for a GPS fix up front so the first/last legs start
      // from where the user actually is. Falls back to the Home/Work base
      // (resolved server-side from baseLabel) when unavailable/denied.
      const gps = await getGpsPosition();
      if (seq !== recalcSeqRef.current || sortMode !== 'geo_aware' || !session) return; // superseded or mode changed while waiting
      setGpsCoords(gps);

      // Inputs to the server's return-destination decision: the current
      // local clock (minutes since midnight) and the estimated duration of
      // every task still ahead before the return leg. The latter blends the
      // typed estimate with learned history via effectiveRemainingForTask —
      // that browser-side data is exactly why the server can't compute it
      // itself, and why longer-than-expected tasks can shift the predicted
      // return from Work to Home.
      const nowLocalMins = now.getHours() * 60 + now.getMinutes();
      const remainingTaskMins = visibleForRoute.reduce((sum, t) => sum + effectiveRemainingForTask(t), 0);

      const json = await authedFetch('/api/today/calculate-route', {
        orderedTaskIds: nearestNeighborOrder(base.coords, located),
        baseLabel: base.label,
        nowLocalMins,
        remainingTaskMins,
        ...(gps ? { origin: { lat: gps.lat, lng: gps.lng } } : {}),
      });
      if (seq !== recalcSeqRef.current) return; // a newer recalculation superseded this one

      if (json.error) {
        setRouteError(json.error);
      } else {
        setDriveFromBaseMins(json.driveFromBaseMins || 0);
        setBasePolyline(json.basePolyline || null);
        setReturnLabel(json.returnLabel || null);
        // The server silently returns which legs it couldn't compute
        // (bad geocode, Directions API failure, etc.) — surface that
        // instead of leaving those tasks with a blank/stale drive time
        // and no explanation for why.
        if (Array.isArray(json.skipped) && json.skipped.length > 0) {
          setRouteError(
            json.skipped.length === 1
              ? `Couldn't get a drive time for "${json.skipped[0]}".`
              : `Couldn't get drive times for: ${json.skipped.join(', ')}.`
          );
        }
        applyRouteLegs(json.legs);
      }
    } catch {
      if (seq === recalcSeqRef.current) {
        setRouteError('Could not reach the server — check your connection and try again.');
      }
    } finally {
      if (seq === recalcSeqRef.current) {
        setRecalculatingRoute(false);
      }
    }
  }

  // Auto-recalculates whenever geo_aware becomes the active sort mode,
  // and zeroes route numbers out the moment it stops being active — so
  // switching away never leaves stale drive-time inflating capacity math
  // in a mode where the order no longer justifies it.
  //
  // The automatic first run waits for todayDataReady: the task list and
  // its route numbers are secondary to simply seeing your day, so GPS
  // acquisition and Directions work only begin once the useful UI is on
  // screen. Manual recalcs from TodayHeader are never gated.
  useEffect(() => {
    if (sortMode === 'geo_aware' && session && todayDataReady) {
      recalcRoute();
    } else if (!(sortMode === 'geo_aware' && session)) {
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setGpsCoords(null);
      setReturnLabel(null);
      setRouteError(null);
    }
    // geo_aware + session but startup data not ready yet: do nothing now;
    // this effect re-runs when todayDataReady flips true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, session, todayDataReady]);

  // Unified Thought Input V1 confirmation handlers. The user confirms a
  // single proposed candidate ("Do you mean 14 Belgium Road?"), picks one
  // from several, or declines — which leaves the relationship unresolved
  // (never invented). Setting the facet here is explicit, so the task is
  // written with the user's confirmed intent rather than an auto-guess.
  function confirmResolution(c: JobLocationCandidate) {
    setConfirmedJobId(c.jobId);
    setConfirmedLocation({
      text: c.matchedField === 'location' && c.locationText ? c.locationText : c.jobName,
      lat: c.lat,
      lng: c.lng,
    });
    setDeclinedResolution(false);
  }

  function declineResolution() {
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(true);
  }

  async function addTask() {
    const originalInput = taskText.trim();
    if (originalInput.length === 0) return;
    const parsed = thought;
    // The action is the parsed intent when the thought carried consumable
    // facets; otherwise it is the raw text, unchanged.
    const text = parsed && parsed.hadFacets && parsed.intent && parsed.intent.length > 0
      ? parsed.intent
      : originalInput;
    const mins = parseMins(taskTime);
    if (mins === null) {
      setError('Could not read that time, try 15m or 1.5h');
      return;
    }
    setError('');
    const userId = session.user.id;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    // A manual reminder date (explicit) wins over the parsed one; otherwise
    // the parsed date applies. Time is the parsed 'HH:MM', if any.
    const surfaceDate = showReminderField && captureSurfaceDate.length > 0
      ? captureSurfaceDate
      : (parsed?.date ?? null);
    const intendedTime = parsed?.time ? parsed.time.label : null;
    // A confirmed resolution wins over a manual pick; both are explicit and
    // never co-occur for the same facet in practice.
    const jobId = confirmedJobId ?? captureJobId;
    const locationText = confirmedLocation && confirmedLocation.text.length > 0
      ? confirmedLocation.text
      : (captureLocation.trim().length > 0 ? captureLocation.trim() : null);
    const lat = confirmedLocation?.lat != null ? confirmedLocation.lat : (captureLocationCoords?.lat ?? null);
    const lng = confirmedLocation?.lng != null ? confirmedLocation.lng : (captureLocationCoords?.lng ?? null);
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        text,
        estimate_mins: mins,
        source: 'came_up',
        order_index: maxOrder + 1,
        surface_date: surfaceDate,
        intended_time: intendedTime,
        location_text: locationText,
        lat,
        lng,
        job_id: jobId,
        original_input: originalInput,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setTasks((prev) => [...prev, data]);
    setTaskText('');
    setTaskTime('');
    setShowReminderField(false);
    setCaptureSurfaceDate('');
    setCaptureLocation('');
    setCaptureLocationCoords(null);
    setManualLocationToggle(false);
    setCaptureJobId(null);
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(false);
    setIntendedTime('');
    setThought(null);
    setLocationResolution(null);
    setCaptureOpen(false);
    if (data.lat != null && sortMode === 'geo_aware') recalcRoute();

    // Log the engine's prediction at capture time so it can be compared
    // against the actual outcome when the task completes. This is the
    // first half of the evidence feedback loop.
    const suggestion = suggestEstimate(text, history, clusters);
    logCapturePrediction({
      userId,
      taskText: text,
      clusterLabel: suggestion?.matchedLabel ?? null,
      clusterCount: suggestion?.sampleCount ?? 0,
      estimatedMins: mins,
      suggestedMins: suggestion?.suggestedMins ?? null,
      confidence: suggestion?.confidence ?? 'low',
    }).catch(() => {}); // fire-and-forget; evidence logging is best-effort
  }

  async function updateTask(
    id: string,
    text: string,
    mins: number,
    surfaceDate: string | null,
    locationText: string | null,
    lat: number | null,
    lng: number | null
  ) {
    const { error } = await supabase
      .from('tasks')
      .update({ text, estimate_mins: mins, surface_date: surfaceDate, location_text: locationText, lat, lng })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not save your changes: ' + error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text, estimate_mins: mins, surface_date: surfaceDate, location_text: locationText, lat, lng } : t))
    );
    if (sortMode === 'geo_aware') recalcRoute();
  }

  // Freeform information ("what I'd write underneath this task on paper").
  // A dedicated narrow write path so it never touches the other fields —
  // saving info mid-capture must never clobber a text/time edit that is
  // mid-blur elsewhere.
  async function saveTaskInfo(id: string, info: string) {
    const { error } = await supabase.from('tasks').update({ info }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not save the information: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, info } : t)));
  }

  // Assigning a Task to a Job (or moving it between Jobs, or detaching it)
  // never changes the Task itself or Today's scheduling — a Job is a lens,
  // not a constraint. The Task stays exactly where Today would show it.
  async function moveTaskToJob(id: string, jobId: string | null) {
    const { error } = await supabase.from('tasks').update({ job_id: jobId }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not move the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, job_id: jobId } : t)));
  }

  async function toggleDueToday(id: string, current: boolean) {
    const { error } = await supabase.from('tasks').update({ due_today: !current }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not update the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_today: !current } : t)));
  }

  async function startTask(id: string) {
    const alreadyActive = tasks.find((t) => t.status === 'active');
    if (alreadyActive) return;
    const startedAt = new Date().toISOString();
    const { error } = await supabase.from('tasks').update({ status: 'active', started_at: startedAt, near_notified: false, over_notified: false, last_overdue_ping_at: null }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not start the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'active', started_at: startedAt } : t)));
  }

  async function stopTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || !task.started_at) return;
    const sessionMins = (Date.now() - new Date(task.started_at).getTime()) / 60000;
    const newLogged = task.logged_mins + sessionMins;
    const { error } = await supabase.from('tasks').update({ status: 'pending', started_at: null, logged_mins: newLogged }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not stop the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'pending', started_at: null, logged_mins: newLogged } : t)));
  }

  async function completeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    let finalLogged = task ? task.logged_mins : 0;
    if (task && task.status === 'active' && task.started_at) {
      finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', started_at: null, logged_mins: finalLogged, actual_mins: Math.round(finalLogged), completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not complete the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    // Keep the learning layer current without waiting for a full reload —
    // this task's outcome (duration and location alike) should be
    // eligible to inform the very next suggestion, not just after the
    // next page load.
    if (task) {
      setHistory((prev) => [
        {
          text: task.text,
          actual_mins: Math.round(finalLogged),
          location_text: task.location_text,
          lat: task.lat,
          lng: task.lng,
        },
        ...prev,
      ]);
      // Log the prediction outcome for the thinking engine's evidence
      // loop. This records what the engine predicted vs what actually
      // happened, so the Patterns surface can show calibration data
      // and the engine can measure its own accuracy over time.
      const suggestion = suggestEstimate(task.text, history, clusters);
      logCompletionOutcome({
        userId: session.user.id,
        taskText: task.text,
        clusterLabel: suggestion?.matchedLabel ?? null,
        clusterCount: suggestion?.sampleCount ?? 0,
        estimatedMins: task.estimate_mins,
        suggestedMins: suggestion?.suggestedMins ?? null,
        confidence: suggestion?.confidence ?? 'low',
        actualMins: Math.round(finalLogged),
      }).catch(() => {}); // fire-and-forget; evidence logging is best-effort
    }
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function deleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not delete the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
  }

  async function addSubtask(taskId: string) {
    const text = (subDraftText[taskId] || '').trim();
    if (text.length === 0) return;
    const mins = parseMins(subDraftTime[taskId] || '') || 0;
    const userId = session.user.id;
    const existing = subtasksByTask[taskId] || [];
    const { data, error } = await supabase
      .from('subtasks')
      .insert({ user_id: userId, task_id: taskId, text, mins, order_index: existing.length })
      .select()
      .single();
    if (error) {
      console.error(error);
      alert('Could not add the subtask: ' + error.message);
      return;
    }
    if (data) {
      setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), data] }));
    }
    setSubDraftText((prev) => ({ ...prev, [taskId]: '' }));
    setSubDraftTime((prev) => ({ ...prev, [taskId]: '' }));
  }

  async function toggleSubtaskDone(subtaskId: string, taskId: string, current: boolean) {
    const { error } = await supabase.from('subtasks').update({ done: !current }).eq('id', subtaskId);
    if (error) {
      console.error(error);
      alert('Could not update the subtask: ' + error.message);
      return;
    }
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).map((s) => (s.id === subtaskId ? { ...s, done: !current } : s)),
    }));
  }

  async function deleteSubtask(subtaskId: string, taskId: string) {
    const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId);
    if (error) {
      console.error(error);
      alert('Could not delete the subtask: ' + error.message);
      return;
    }
    setSubtasksByTask((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] || []).filter((s) => s.id !== subtaskId),
    }));
  }

  if (!session) {
    return (
      <AuthScreen
        hasSignedInBefore={hasSignedInBefore}
        isNewUser={isNewUser}
        setIsNewUser={setIsNewUser}
        showForgotPassword={showForgotPassword}
        setShowForgotPassword={setShowForgotPassword}
        signingInWithGoogle={signingInWithGoogle}
        onGoogleSignIn={signInWithGoogle}
        signInError={signInError}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onPasswordSignIn={signInWithPassword}
        onForgotPassword={handleForgotPassword}
        forgotPasswordSent={forgotPasswordSent}
        setForgotPasswordSent={setForgotPasswordSent}
        magicLinkSent={magicLinkSent}
        setMagicLinkSent={setMagicLinkSent}
        onMagicLink={handleMagicLink}
      />
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingScreen
        workStart={workStart}
        setWorkStart={setWorkStart}
        workEnd={workEnd}
        setWorkEnd={setWorkEnd}
        workDays={workDays}
        onToggleWorkDay={toggleWorkDay}
        homeLocation={homeLocation}
        setHomeLocation={setHomeLocation}
        onHomeSelected={handleHomeSelected}
        workLocation={workLocation}
        setWorkLocation={setWorkLocation}
        onWorkSelected={handleWorkSelected}
        onboardSaving={onboardSaving}
        onComplete={completeOnboarding}
      />
    );
  }

  function completedSubtaskMins(taskId: string): number {
    return (subtasksByTask[taskId] || []).filter((s) => s.done).reduce((sum, s) => sum + s.mins, 0);
  }

  // Display-facing remaining time: driven purely by what the person typed.
  // Never silently changes — this is "what does the progress bar on this
  // specific task say", and it should always match what you set.
  function remainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
  }

  // Capacity-facing remaining time: the "brain". Blends the typed estimate
  // with what history says this kind of task actually takes, so the
  // aggregate capacity picture (the ring, the day rail, overflow flags,
  // capacity_first sort) is calibrated by reality — without ever touching
  // the number the person actually sees on the task itself.
  function effectiveRemainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    const effEstimate = learnedEffectiveEstimates.get(t.id) ?? t.estimate_mins;
    return Math.max(effEstimate - logged - completedSubtaskMins(t.id), 0);
  }

  const todayStr = localDateStr(now);

  // Reminders (future surface_date) are excluded here, before anything
  // else touches capacity, sort, or the day rail — they don't exist for
  // any time-pressure purpose until their date arrives.
  const visibleTasks = tasks.filter((t) => !isScheduledForLater(t, todayStr));
  const scheduledTasks = tasks.filter((t) => isScheduledForLater(t, todayStr));

  const todayMeetings = meetings.filter((m) => {
    if (!m.start_time) return true;
    return localDateStr(new Date(m.start_time)) === todayStr;
  });
  const meetingMins = todayMeetings.reduce((sum, m) => sum + m.duration_mins, 0);

  const todayDow = now.getDay();
  const isWorkDay = workDays.includes(todayDow);

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workStartMinutes = timeStringToMinutes(workStart);
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = isWorkDay ? Math.max(workEndMinutes - nowMinutesOfDay, 0) : 0;
  const taskCapacity = minutesLeftToday - meetingMins;

  const geoAware = sortMode === 'geo_aware';
  const currentBase = geoAware ? determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords) : { coords: null, label: null };

  let ordered: Task[];
  if (geoAware && currentBase.coords) {
    const locatedForOrder = visibleTasks
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ id: t.id, lat: t.lat as number, lng: t.lng as number }));
    const structuralOrder = [...visibleTasks].sort((a, b) => a.order_index - b.order_index);
    const geoIds = nearestNeighborOrder(currentBase.coords, locatedForOrder);
    ordered = weaveGeoOrder(structuralOrder as any, geoIds) as Task[];
  } else if (geoAware) {
    // geo_aware selected but no base configured — falls back to manual
    // order rather than pretending a route exists.
    ordered = sortTasks(visibleTasks, 'manual');
  } else {
    ordered = sortTasks(visibleTasks, sortMode, effectiveRemainingForTask, taskCapacity);
  }
  const orderedIds = ordered.map((t) => t.id);

  // Route drive time only enters capacity math in geo_aware mode. Each
  // located task carries its own outgoing leg's drive_mins_to_next (the
  // last located task carries the return leg back to the start), and the
  // origin → first leg is held in driveFromBaseMins.
  const locatedDriveSum = geoAware
    ? visibleTasks.filter((t) => t.lat != null && t.lng != null).reduce((sum, t) => sum + (t.drive_mins_to_next || 0), 0)
    : 0;
  const routeDriveMins = geoAware ? driveFromBaseMins + locatedDriveSum : 0;

  // The located destinations in on-screen (geo) order. Leg rows and the
  // route map both render from this sequence.
  const locatedInOrder = ordered.filter((t) => t.lat != null && t.lng != null);
  const locatedIndexById: Record<string, number> = {};
  locatedInOrder.forEach((t, i) => (locatedIndexById[t.id] = i));

  // The route's start point: live GPS when we have a fix, else the
  // current Home/Work base the order was built from.
  const routeOrigin = gpsCoords ?? currentBase.coords;
  const originLabel = gpsCoords
    ? 'current location'
    : currentBase.label === 'work'
      ? 'office'
      : currentBase.label === 'home'
        ? 'home'
        : 'start';

  // "View Map" shows the same ordered geo-aware destinations in MapView,
  // with the start point as the base marker, its origin→first leg as the
  // base polyline, and each located task as a pin carrying its own leg
  // polyline — matching how Travel's trip days hand their route to
  // MapView, so pin taps keep the Google Maps handoff behaviour.
  const mapBase = routeOrigin && basePolyline
    ? {
        location_text: gpsCoords ? 'Current location' : currentBase.label === 'work' ? 'Office' : 'Home',
        lat: routeOrigin.lat,
        lng: routeOrigin.lng,
        route_polyline: basePolyline,
      }
    : null;
  const mapActivities = locatedInOrder.map((t) => ({
    id: t.id,
    text: t.text,
    location_text: t.location_text,
    lat: t.lat,
    lng: t.lng,
    route_polyline: t.route_polyline,
  }));
  const hasRoute = geoAware && locatedInOrder.length > 0 && basePolyline != null;

  const remainingTaskMins = ordered.reduce((sum, t) => sum + effectiveRemainingForTask(t), 0);
  const remainingWorkMins = meetingMins + remainingTaskMins + routeDriveMins;

  const overloaded = isWorkDay && minutesLeftToday > 0 && remainingWorkMins > minutesLeftToday;

  let cumulative = 0;

  const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateOnlyLabel = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const trackSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const nowPercent = Math.min(Math.max((nowMinutesOfDay - workStartMinutes) / trackSpan, 0), 1);
  const projectedFinishMinutes = nowMinutesOfDay + remainingWorkMins;
  const projectedPercent = (projectedFinishMinutes - workStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) || null : null;

  let openTaskRemaining = 0;
  let openTaskLiveLogged = 0;
  if (openTask) {
    openTaskRemaining = remainingForTask(openTask);
    openTaskLiveLogged = openTask.logged_mins;
    if (openTask.status === 'active' && openTask.started_at) {
      openTaskLiveLogged += (Date.now() - new Date(openTask.started_at).getTime()) / 60000;
    }
  }

  const activeTask = visibleTasks.find((t) => t.status === 'active' && t.estimate_mins > 0) || null;
  let activeLiveLogged = 0;
  if (activeTask && activeTask.started_at) {
    activeLiveLogged = activeTask.logged_mins + (Date.now() - new Date(activeTask.started_at).getTime()) / 60000;
  }
  const activeOverEstimate = !!activeTask && activeTask.estimate_mins > 0 && activeLiveLogged > activeTask.estimate_mins;

  return (
    <div className={activeTask ? 'app-shell has-active' : 'app-shell'}>
      <TravelAwarenessBanner userId={session.user.id} />

      <TodayHeader
        overloaded={overloaded}
        weekdayLabel={weekdayLabel}
        dateOnlyLabel={dateOnlyLabel}
        isWorkDay={isWorkDay}
        minutesLeftToday={minutesLeftToday}
        remainingWorkMins={remainingWorkMins}
        nowPercent={nowPercent}
        planWidthPercent={planWidthPercent}
        workStart={workStart}
        workEnd={workEnd}
        geoAware={geoAware}
        recalculatingRoute={recalculatingRoute}
        currentBaseLabel={currentBase.label}
        onRecalcRoute={recalcRoute}
        routeError={routeError}
        hasRoute={hasRoute}
        onViewMap={() => setMapOpen(true)}
        userId={session.user.id}
      />

      <div className="task-list">
        {taskLoadError ? (
          <div className="empty-state">
            <div className="empty-state-title">Couldn't load your tasks.</div>
            <div className="empty-state-sub">{taskLoadError}</div>
          </div>
        ) : (
          ordered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">Nothing on your plate yet.</div>
              <div className="empty-state-sub">
                Add something and Dokkit will work out what realistically fits today.
              </div>
              <button
                className="btn btn-steel"
                onClick={() => setCaptureOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PlusIcon size={16} /> Add a task
              </button>
            </div>
          )
        )}
        {ordered.map((t, idx) => {
          const remainingForThis = remainingForTask(t);
          const effectiveRemaining = effectiveRemainingForTask(t);
          cumulative += effectiveRemaining;
          // List items (no estimate) can never be "over capacity" — there's
          // no time on the clock for them to compete for.
          const overCap = t.estimate_mins > 0 && cumulative > taskCapacity;
          const anyActive = visibleTasks.some((x) => x.status === 'active' && x.estimate_mins > 0);
          const subs = subtasksByTask[t.id] || [];
          let liveLogged = t.logged_mins;
          if (t.status === 'active' && t.started_at) {
            liveLogged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
          }

          const suggestion = t.estimate_mins > 0 ? suggestEstimate(t.text, history, clusters) : null;
          const learnedHint =
            suggestion && hasMeaningfulDivergence(t.estimate_mins, suggestion.suggestedMins)
              ? fmtMins(suggestion.suggestedMins)
              : null;

          // In geo_aware mode, located tasks render their drive legs as
          // distinct rows between the destinations they connect — an
          // origin→first leg before the first located task, a leg between
          // each located task, and the return leg after the last one.
          const isLocated = t.lat != null && t.lng != null;
          const locatedIdx = isLocated ? locatedIndexById[t.id] : -1;

          return (
            <Fragment key={t.id}>
              {geoAware && isLocated && locatedIdx === 0 && driveFromBaseMins > 0 && (
                <TravelLeg
                  label={fmtMins(driveFromBaseMins)}
                  detail={`Drive from ${originLabel}`}
                />
              )}
              <div ref={(el) => { rowElsRef.current[t.id] = el; }} style={dragRowStyle(idx, t.id)}>
                <TaskCard
                  task={t}
                  remainingForThis={remainingForThis}
                  liveLogged={liveLogged}
                  overCap={overCap}
                  anyActive={anyActive}
                  subs={subs}
                  learnedHint={learnedHint}
                  jobLabel={jobs.find((j) => j.id === t.job_id)?.name ?? null}
                  expanded={expandedId === t.id}
                  onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  onOpenDetails={() => { setExpandedId(null); setOpenTaskId(t.id); }}
                  onComplete={completeTask}
                  onStart={startTask}
                  onStop={stopTask}
                  onToggleSubtaskDone={toggleSubtaskDone}
                  onSaveInfo={saveTaskInfo}
                  dragHandleProps={
                    sortMode === 'manual'
                      ? {
                          onPointerDown: (e) => handleDragHandlePointerDown(e, t.id, orderedIds),
                          onPointerMove: handleDragHandlePointerMove,
                          onPointerUp: handleDragHandlePointerUp,
                        }
                      : undefined
                  }
                />
              </div>
              {geoAware && isLocated && t.drive_mins_to_next > 0 && (
                <TravelLeg
                  label={locatedIdx === locatedInOrder.length - 1
                    ? `${fmtMins(t.drive_mins_to_next)} → ${returnLabel ?? originLabel}`
                    : fmtMins(t.drive_mins_to_next)}
                  detail={locatedIdx === locatedInOrder.length - 1
                    ? `Drive back to ${returnLabel ?? originLabel}`
                    : 'Drive to the next stop'}
                />
              )}
            </Fragment>
          );
        })}
        {scheduledTasks.length > 0 && (
          <div className="scheduled-link-row">
            <button className="btn-text" onClick={() => setScheduledSheetOpen(true)}>
              {scheduledTasks.length} scheduled for later
            </button>
          </div>
        )}
      </div>

      {captureOpen && (
        <CaptureSheet
          taskText={taskText}
          setTaskText={setTaskText}
          taskTime={taskTime}
          setTaskTime={setTaskTime}
          captureSuggestion={captureSuggestion}
          captureLocationSuggestion={captureLocationSuggestion}
          captureLocationMemorySuggestion={captureLocationMemorySuggestion}
          captureJobSuggestion={captureJobSuggestion}
          captureContext={captureContext}
          locationFieldVisible={locationFieldVisible}
          addTask={addTask}
          captureLocation={captureLocation}
          setCaptureLocation={setCaptureLocation}
          captureLocationCoords={captureLocationCoords}
          setCaptureLocationCoords={setCaptureLocationCoords}
          manualLocationToggle={manualLocationToggle}
          setManualLocationToggle={setManualLocationToggle}
          showReminderField={showReminderField}
          setShowReminderField={setShowReminderField}
          captureSurfaceDate={captureSurfaceDate}
          setCaptureSurfaceDate={setCaptureSurfaceDate}
          jobs={jobs}
          captureJobId={captureJobId}
          setCaptureJobId={setCaptureJobId}
          thought={thought}
          intendedTime={intendedTime}
          locationResolution={locationResolution}
          declinedResolution={declinedResolution}
          onConfirmResolution={confirmResolution}
          onDeclineResolution={declineResolution}
          error={error}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Dock it"><PlusIcon size={24} /></button>
      )}

      {activeTask && (
        <div
          className={activeOverEstimate ? 'active-timer-bar over' : 'active-timer-bar'}
          onClick={() => { if (activeTask) setOpenTaskId(activeTask.id); }}
        >
          <span className="active-timer-info">
            <span className="active-timer-dot" />
            <span className="active-timer-text">{activeTask.text}</span>
          </span>
          <span className="active-timer-actions">
            <span className="active-timer-elapsed mono">{fmtMins(activeLiveLogged)}</span>
            <button
              className="active-timer-stop"
              onClick={(e) => { e.stopPropagation(); if (activeTask) stopTask(activeTask.id); }}
              aria-label="Stop timer"
            >
              <StopIcon />
            </button>
          </span>
        </div>
      )}

      {openTask && (
        <TaskDetailSheet
          task={openTask}
          subs={subtasksByTask[openTask.id] || []}
          remainingForThis={openTaskRemaining}
          liveLogged={openTaskLiveLogged}
          anyActive={visibleTasks.some((x) => x.status === 'active' && x.estimate_mins > 0)}
          context="today"
          jobs={jobs}
          onClose={() => setOpenTaskId(null)}
          onSave={updateTask}
          onComplete={completeTask}
          onStart={startTask}
          onStop={stopTask}
          onToggleDue={toggleDueToday}
          onAddSubtask={addSubtask}
          onToggleSubtaskDone={toggleSubtaskDone}
          onDeleteSubtask={deleteSubtask}
          onDelete={deleteTask}
          onSaveInfo={saveTaskInfo}
          onMoveToJob={moveTaskToJob}
          subDraftText={subDraftText[openTask.id] || ''}
          subDraftTime={subDraftTime[openTask.id] || ''}
          setSubDraftText={(v) => setSubDraftText((prev) => ({ ...prev, [openTask.id]: v }))}
          setSubDraftTime={(v) => setSubDraftTime((prev) => ({ ...prev, [openTask.id]: v }))}
        />
      )}

      {scheduledSheetOpen && (
        <ScheduledSheet
          tasks={scheduledTasks}
          onClose={() => setScheduledSheetOpen(false)}
          onOpenTask={(id) => setOpenTaskId(id)}
        />
      )}

      {mapOpen && (
        <MapView
          base={mapBase}
          activities={mapActivities}
          onClose={() => setMapOpen(false)}
        />
      )}

      <SurfaceNav active="today" onNavigate={(s: Surface) => recordEvent(s, true)} />
    </div>
  );
}
