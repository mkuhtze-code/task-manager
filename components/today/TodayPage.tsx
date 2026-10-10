'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';
import {
  computeTravelPresenceImpact,
} from '@/lib/travelPresence';
import { localDateStr as travelLocalDateStr } from '@/lib/travelContext';
import { TaskCard } from '@/components/TaskCard';
import ContextLine from '@/components/ContextLine';
import { TravelLeg } from '@/components/TravelLeg';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { ScheduledSheet } from '@/components/ScheduledSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import {
  LIST_TASK_MARKER,
  matchSubtaskRefs,
  type TaskListOps,
  type ListTaskCandidate,
} from '@/lib/speech/taskListBridge';
import { RealityCheckSheet } from '@/components/RealityCheckSheet';
import { TodayHeader } from '@/components/TodayHeader';
import MapView from '@/components/MapView';
import SurfaceNav from '@/components/SurfaceNav';
import { OnboardingScreen } from '@/components/AuthScreen';
import { PostStopPrompt, type PostStopPromptState } from '@/components/PostStopPrompt';
import { PlusIcon } from '@/components/icons';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import { registerCaptureOpen } from '@/lib/captureOpen';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useDesktopWorkspaceKeys } from '@/hooks/useDesktopWorkspaceKeys';
import type { OnboardingAnswers } from '@/lib/onboardingTypes';
import { seedStarterPack, clearStarterPack, isStarterTask } from '@/lib/starterPack';
import {
  todayEmptyCopy,
  orderedNavSurfaces,
  firstSessionLine,
  dayOrderHint,
} from '@/lib/surfaceCopy';
import { shouldShowSetupLine, markSetupLineSeen } from '@/lib/uxFlags';
import { persistNavOrder } from '@/components/DesktopProductNav';

import {
  defaultUserProfile,
  profileFromAnswers,
  profileFromSettings,
  settingsPatchFromProfile,
  type UserProfile,
} from '@/lib/userProfile';
import { isReliableActualMins, resolveActualForLearning } from '@/lib/thinking/durationQuality';
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
import { logCapturePrediction } from '@/lib/thinking/evidence/predictionLog';
import { closeCompletionLoop, historyRowFromCompletion } from '@/lib/thinking/evidence/closeCompletionLoop';
import { decidePersonalGravity, LOOKBACK_DAYS } from '@/lib/thinking/decisions/personalGravity';
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import { resolveJobAndLocation, deriveAliasTerm, type JobLocationResolution, type JobLocationCandidate, type EntityAliasMemory, type EntityRelationshipMemory } from '@/lib/unifiedInput/resolve';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import type { SurfaceEvent, Surface } from '@/lib/thinking/types';
import { determineBase, nearestNeighborOrder, weaveGeoOrder, type Coords } from '@/lib/todayRoute';
import { sortTasks } from '@/lib/taskSort';
import { authedFetch, apiUrl } from '@/lib/authedFetch';
import {
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
  fmtClock,
  isScheduledForLater,
  localDateStr,
  parseMins,
  timeStringToMinutes,
} from '@/lib/timeFormat';
import {
  computeAvailability,
  buildDayCommitments,
  remainingTaskCapacityMins,
} from '@/lib/calendar/planning';
import {
  nextWorkSurfaceDate,
  summarizeReshape,
  tasksForRealityCheck,
  historyObservationForUpdate,
  saveDayClose,
  consumeMorningPlanMessage,
  noteOpenRealityWindow,
  readPendingRealityInvite,
  dismissPendingRealityInvite,
  type RealityUpdate,
  type PendingRealityInvite,
} from '@/lib/realityCapture';
import {
  planOverflowCarry,
  buildRuntimeObservations,
  lookupTaskSignals,
  sequenceOrderIdsForOpenTasks,
} from '@/lib/dayFit';
import { buildLiveDayPlan } from '@/lib/thinking/v3/liveDay';
import { calibrateFromOutcomes } from '@/lib/thinking/calibration';
import { getBuffer } from '@/lib/thinking/evidence';
import { getGpsPosition } from '@/lib/today/geolocation';
import { isRouteStop, personalVisitEvidenceFromHistory } from '@/lib/today/visitIntent';
import { TASK_COLUMNS, PASSIVE_TODAY_KEY } from '@/lib/today/constants';
import {
  remainingForTask as remainingForTaskPure,
  effectiveRemainingForTask as effectiveRemainingForTaskPure,
} from '@/lib/today/taskRemaining';
import { useNow } from '@/hooks/useNow';
import { useTodayAuth } from '@/hooks/useTodayAuth';
import { notifyTaskActivity } from '@/hooks/useActiveTask';
import { showActiveTimerNotification } from '@/lib/activeTimerNotify';

/** Authenticated Today surface — mounted only after authReady && session. */

/** Phase 5 context for V3 duration conditioning (job / place / hour). */
function estimateContextFrom(
  source: {
    job_id?: string | null;
    location_text?: string | null;
    jobId?: string | null;
    locationText?: string | null;
  },
  now: Date
) {
  return {
    jobId: source.job_id ?? source.jobId ?? null,
    locationText: source.location_text ?? source.locationText ?? null,
    localHour: now.getHours(),
  };
}

export function TodayPage() {
  const router = useRouter();
  const { session, setSignInError } = useTodayAuth();
  const now = useNow(5000);

  // Keep Today in sync when the global player stops a task.
  // If real minutes were banked, offer one-tap Done (frictionless learning).
  useEffect(() => {
    function onActivity(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      if (detail.type === 'stopped' && detail.taskId) {
        const taskId = String(detail.taskId);
        const logged =
          typeof detail.logged_mins === 'number' ? detail.logged_mins : null;
        const detailText =
          typeof detail.text === 'string' ? detail.text : null;

        setTasks((prev) => {
          const row = prev.find((t) => t.id === taskId);
          const mins = logged != null ? logged : row?.logged_mins ?? 0;
          const text = detailText ?? row?.text ?? '';
          // Queue prompt outside updater — schedule after this tick.
          if (isReliableActualMins(mins) && text) {
            queueMicrotask(() => {
              setPostStopPrompt({ taskId, text, loggedMins: mins });
            });
          }
          return prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'pending' as const,
                  started_at: null,
                  logged_mins: logged != null ? logged : t.logged_mins,
                }
              : t
          );
        });
      }
      if (detail.type === 'completed' && detail.taskId) {
        setPostStopPrompt((prev) =>
          prev && prev.taskId === detail.taskId ? null : prev
        );
      }
    }
    window.addEventListener('dokkit:task-activity', onActivity);
    return () => window.removeEventListener('dokkit:task-activity', onActivity);
  }, []);


  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scheduledSheetOpen, setScheduledSheetOpen] = useState(false);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [travelStopsToday, setTravelStopsToday] = useState<
    Parameters<typeof computeTravelPresenceImpact>[0]
  >([]);
  const [calendarEvents, setCalendarEvents] = useState<
    Array<{
      id: string;
      title: string;
      start_at: string;
      end_at: string;
      all_day: boolean;
      location: string | null;
    }>
  >([]);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('16:00');
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS);
  const [sortMode, setSortMode] = useState<SortMode>('capacity_first');
  const [captureOpen, setCaptureOpen] = useState(false);

  // Desktop sidebar Dock it → open capture sheet
  useEffect(() => registerCaptureOpen(() => setCaptureOpen(true)), []);
  const { isDesktop } = useSurfaceMode();
  const [deskListWidth, setDeskListWidth] = useState(320);
  const deskSplitDragging = useRef(false);
  const deskListWidthRef = useRef(320);

  useEffect(() => {
    deskListWidthRef.current = deskListWidth;
  }, [deskListWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('dokkit.ux.desk_list_w');
      if (raw) {
        const n = Number(raw);
        if (n >= 240 && n <= 520) {
          setDeskListWidth(n);
          deskListWidthRef.current = n;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    function onMove(e: PointerEvent) {
      if (!deskSplitDragging.current) return;
      const next = Math.min(520, Math.max(240, e.clientX));
      deskListWidthRef.current = next;
      setDeskListWidth(next);
    }
    function onUp() {
      if (!deskSplitDragging.current) return;
      deskSplitDragging.current = false;
      try {
        window.localStorage.setItem(
          'dokkit.ux.desk_list_w',
          String(deskListWidthRef.current)
        );
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDesktop]);


  // Must run every render (before any early return) — React #310 otherwise.
  // Keyboard navigation must only walk tasks that belong on Today —
  // future surface_date (scheduled-for-later) tasks stay out of the cycle.
  useDesktopWorkspaceKeys({
    enabled: isDesktop,
    openId: openTaskId,
    setOpenId: setOpenTaskId,
    orderedIds: tasks
      .filter(
        (x) =>
          x.status !== 'done' &&
          !isScheduledForLater(x, localDateStr(now))
      )
      .map((x) => x.id),
  });
  const [postStopPrompt, setPostStopPrompt] = useState<PostStopPromptState | null>(null);
  const [postStopBusy, setPostStopBusy] = useState(false);
  const [realityCheckOpen, setRealityCheckOpen] = useState(false);
  const [realityCheckBusy, setRealityCheckBusy] = useState(false);
  const [realityCheckMessage, setRealityCheckMessage] = useState<string | null>(null);
  /** Next-morning optional card — never auto-opens the sheet. */
  const [pendingRealityInvite, setPendingRealityInvite] = useState<PendingRealityInvite | null>(null);
  const [clearingStarter, setClearingStarter] = useState(false);
  const [setupLineDismissed, setSetupLineDismissed] = useState(() => !shouldShowSetupLine());


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
  const [userProfile, setUserProfile] = useState<UserProfile>(() => defaultUserProfile());

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
  // Unified Thought Input V1.2: the user's persistent entity-confirmation
  // memory (alias → entity) and which job ids the existing lifecycle already
  // considers finished. Together these let the resolver auto-apply a
  // previously confirmed relationship instead of re-asking. loadedEntityAliasRows
  // is the raw string map used to refresh state after a new confirmation is
  // persisted (State Reflector — DB is the source of truth).
  const [entityAliases, setEntityAliases] = useState<EntityAliasMemory[]>([]);
  const [doneJobIds, setDoneJobIds] = useState<Set<string>>(new Set());
  const loadedEntityAliasRows = useRef<Record<string, { type: string; entityId: string }>>({});
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

  // V1.2: the resolver's view of the user's confirmed relationships, plus
  // which jobs the existing lifecycle still considers active. A relationship
  // to a finished job is treated as expired by the resolver (it never forces
  // a completed job). Active matches `isJobDone` exactly: a job is finished
  // only when it has done tasks and no open tasks remain.
  const activeEntityIds = useMemo(() => {
    const hasOpenTask = new Set(
      tasks.map((t) => t.job_id).filter((id): id is string => id != null)
    );
    const active = new Set<string>();
    for (const j of jobs) {
      if (!(doneJobIds.has(j.id) && !hasOpenTask.has(j.id))) active.add(j.id);
    }
    return active;
  }, [tasks, jobs, doneJobIds]);

  const entityMemory = useMemo<EntityRelationshipMemory>(
    () => ({
      aliases: entityAliases.filter((a) => a.active),
      activeEntityIds,
    }),
    [entityAliases, activeEntityIds]
  );

  // Live interpretation — debounced so mid-word typing never flashes a match chip.
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

    const handle = window.setTimeout(() => {
      const parsed = parseThought(raw);
      setThought(parsed);
      const resolution = resolveJobAndLocation(parsed, jobs, entityMemory);
      setLocationResolution(resolution);
      setIntendedTime(parsed.time ? parsed.time.label : '');
      setConfirmedJobId(null);
      setConfirmedLocation(null);
      setDeclinedResolution(false);

      // known → silent attach (no chip in CaptureSheet).
      if (resolution.state === 'known') {
        const c = resolution.candidate;
        setConfirmedJobId(c.jobId);
        setConfirmedLocation({
          text:
            c.matchedField === 'location' && c.locationText
              ? c.locationText
              : c.jobName,
          lat: c.lat,
          lng: c.lng,
        });
      }

      if (
        resolution.state === 'none' &&
        parsed.locationHint &&
        parsed.locationHint.length > 0
      ) {
        setCaptureLocation((prev) =>
          prev.trim().length > 0 ? prev : parsed.locationHint!
        );
        setManualLocationToggle(true);
      }
    }, 380);

    return () => window.clearTimeout(handle);
  }, [taskText, jobs, entityMemory]);

  // Surfaced in the task list when the tasks query itself fails, so a
  // load failure is never mistaken for "Nothing on your plate yet."
  const [taskLoadError, setTaskLoadError] = useState('');
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

  // Once the user has real work (or dismisses), never show the setup cue again.
  useEffect(() => {
    if (setupLineDismissed) return;
    const hasRealWork =
      history.length > 0 ||
      tasks.some((t) => !isStarterTask(t));
    if (hasRealWork) {
      markSetupLineSeen();
      setSetupLineDismissed(true);
    }
  }, [setupLineDismissed, history.length, tasks]);
  // One shared brain slice: duration + behaviour + calibrated soft floor.
  const runtime = useMemo(() => {
    // Onboarding seeds the soft floor; calibration only overrides once it
    // has enough closed prediction loops (see MIN_SAMPLES in calibration).
    // Must never throw during render — blank Today is worse than a soft prior.
    try {
      const cal = calibrateFromOutcomes(getBuffer(), userProfile.softFloorBaseMins);
      return buildRuntimeObservations(history, {
        softFloorMins: cal.softFloorMins,
        blendScale: cal.blendScale,
        calibrationExplain: cal.explain,
        anchorSameDayRate: userProfile.anchorSameDayRate,
        flexibleSameDayRate: userProfile.flexibleSameDayRate,
      });
    } catch (err) {
      console.error('[TodayPage] runtime observations failed', err);
      return buildRuntimeObservations([], {
        softFloorMins: userProfile.softFloorBaseMins,
        blendScale: 1,
        calibrationExplain: null,
        anchorSameDayRate: userProfile.anchorSameDayRate,
        flexibleSameDayRate: userProfile.flexibleSameDayRate,
      });
    }
  }, [history, userProfile.softFloorBaseMins, userProfile.anchorSameDayRate, userProfile.flexibleSameDayRate]);
  const clusters = runtime.clusters;

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

      const suggestion = suggestEstimate(
        t.text,
        history,
        clusters,
        estimateContextFrom(t, now)
      );
      estimates.set(
        t.id,
        effectiveEstimate(t.estimate_mins, suggestion, runtime.blendScale)
      );
    }

    return estimates;
  }, [tasks, history, clusters, runtime.blendScale, now.getHours()]);

  // Same runtime brain as capacity — duration chip and day rail stay consistent.
  const captureSignals = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return lookupTaskSignals(trimmed, runtime);
  }, [taskText, runtime]);

  const captureSuggestion = captureSignals?.estimate ?? null;
  const captureDurationExplain = captureSignals?.explainDuration ?? null;

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

    // Calm morning signals — never auto-open Reality Check.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const today = localDateStr(new Date());
    const msg = consumeMorningPlanMessage(today);
    if (msg) setRealityCheckMessage(msg);
    const invite = readPendingRealityInvite(today);
    if (invite) setPendingRealityInvite(invite);
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
        'work_start, work_end, work_days, timezone, sort_mode, onboarded, home_location_text, home_lat, home_lng, work_location_text, work_lat, work_lng, role, work_type, carry_style, day_shape, onboarding_answers, soft_cost_scale, same_day_protection, jobs_emphasis, travel_emphasis, meetings_emphasis'
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
    // Legacy source='outlook' rows are superseded by calendar_events and
    // excluded from both the capacity math and the Today commitments strip.
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const meetingsPromise = supabase
      .from('meetings')
      .select('id, text, duration_mins, start_time, source')
      .or(
        `start_time.is.null,and(start_time.gte.${dayStart.toISOString()},start_time.lt.${nextDay.toISOString()})`
      );

    // External commitments (synced calendar events) overlapping today feed
    // the same capacity math as meetings. Events are read-only external
    // blocks of time; cancelled ones are excluded so they stop consuming
    // capacity. RLS limits this to the user's own events.
    const eventsPromise = supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, all_day, location, status')
      .neq('status', 'cancelled')
      .or(`start_at.lt.${nextDay.toISOString()},and(end_at.gt.${dayStart.toISOString()})`);

    // Jobs for the capture sheet's "Add to a job" disclosure and the unified
    // thought resolver (which matches against name AND location and, when a
    // resolution is confirmed or auto-applied, pins the task's location to the
    // job's own address/coords).
    const jobsPromise = supabase
      .from('jobs')
      .select('id, name, client, location_text, lat, lng, created_at')
      .order('created_at', { ascending: false });

    // V1.2: the user's confirmed entity relationships (alias → entity) and
    // the set of jobs the existing lifecycle already considers finished (a job
    // is "done" when it has at least one task and ALL of its tasks are done).
    // The resolver needs both: learned relationships to auto-apply, and the
    // finished set so a relationship to a completed job expires instead of
    // blindly forcing it.
    const aliasesPromise = supabase
      .from('entity_aliases')
      .select('id, user_id, alias, entity_type, entity_id, source, active, created_at, updated_at');

    const doneJobsPromise = supabase
      .from('tasks')
      .select('job_id')
      .eq('status', 'done')
      .not('job_id', 'is', null);

    // Completed-task history for the learning layer.
    // Start this at the same time as the other reads.
    const historyPromise = supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at, estimate_mins, logged_mins, due_today, surface_date, source, intended_time')
      .eq('status', 'done')
      .neq('source', 'starter')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(250);

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
      { data: eventRows },
      { data: jobRows },
      { data: historyRows },
      { data: aliasRows },
      { data: doneJobRows },
    ] = await Promise.all([
      settingsPromise,
      meetingsPromise,
      eventsPromise,
      jobsPromise,
      historyPromise,
      aliasesPromise,
      doneJobsPromise,
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

      // Seed the thinking engine from onboarding priors (or column overrides).
      setUserProfile(profileFromSettings(settings));
      {
        const p = profileFromSettings(settings);
        persistNavOrder(orderedNavSurfaces(p));
      }

      // onboarded defaults false on the column; only explicit false shows
      // the welcome screen — anything truthy skips it.
      // Always sync both ways so a successful completeOnboarding is not
      // undone by a stale in-memory flag, and a failed write cannot leave
      // the UI stuck on Today while the DB still says not onboarded.
      setShowOnboarding(settings.onboarded === false);
    }

    setMeetings(meetingRows || []);
    setCalendarEvents(
      (eventRows || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        start_at: r.start_at,
        end_at: r.end_at,
        all_day: r.all_day,
        location: r.location,
      }))
    );
    setJobs((jobRows as Job[]) || []);

    // V1.2: fold the confirmed relationships into resolver memory. Loaded
    // rows stay visible — only `active` ones are consulted by the resolver.
    const aliases = (aliasRows || []).map((r: any) => ({
      alias: r.alias,
      entityType: r.entity_type,
      entityId: r.entity_id,
      active: r.active !== false,
    }));
    setEntityAliases(
      aliases.filter((a) => a.entityType === 'job') as EntityAliasMemory[]
    );
    // Remember the raw DB rows (including inactive ones) so the State
    // Reflector can distinguish "new relationship" from "re-confirmation".
    loadedEntityAliasRows.current = {};
    (aliasRows || []).forEach((r: any) => {
      loadedEntityAliasRows.current[`${r.entity_type}:${r.entity_id}:${r.alias}`] = {
        type: r.entity_type,
        entityId: r.entity_id,
      };
    });
    // Jobs that have at least one task and every task done. A job here is
    // finished; its confirmed relationships must not force it anymore.
    setDoneJobIds(new Set((doneJobRows || []).map((r: any) => r.job_id)));

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
        requires_visit: r.requires_visit ?? null,
        lat: r.lat,
        lng: r.lng,
        job_id: r.job_id,
        created_at: r.created_at,
        completed_at: r.completed_at,
        estimate_mins: r.estimate_mins,
        logged_mins: r.logged_mins,
        due_today: r.due_today,
        surface_date: r.surface_date,
        source: r.source,
        intended_time: r.intended_time,
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

  async function completeOnboarding(answers: OnboardingAnswers) {
    if (!session) return;
    setOnboardSaving(true);

    const profile = profileFromAnswers(answers);
    const priorPatch = settingsPatchFromProfile(profile);

    const payload = {
      work_start: workStart,
      work_end: workEnd,
      work_days: workDays,
      home_location_text: homeLocation || null,
      home_lat: homeCoords?.lat ?? null,
      home_lng: homeCoords?.lng ?? null,
      work_location_text: workLocation || null,
      work_lat: workCoords?.lat ?? null,
      work_lng: workCoords?.lng ?? null,
      onboarding_answers: answers,
      role: answers.role,
      work_type: answers.workType ?? null,
      carry_style: answers.carryStyle,
      day_shape: answers.dayShape ?? answers.dayFeel ?? null,
      ...priorPatch,
    };

    try {
      const res = await fetch(apiUrl('/api/account/complete-onboarding'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Could not save your setup');
      }
    } catch (e: unknown) {
      setOnboardSaving(false);
      const msg = e instanceof Error ? e.message : 'Could not save your setup';
      console.error(e);
      alert(msg);
      return;
    }

    setOnboardSaving(false);

    // Apply immediately so the first Today session is already adapted.
    setUserProfile(profile);
    setSortMode(profile.suggestedSortMode);
    const navOrder = orderedNavSurfaces(profile);
    persistNavOrder(navOrder);

    // Leave the questionnaire before any reload.
    setShowOnboarding(false);

    try {
      await seedStarterPack(supabase, session.user.id, answers, profile);
    } catch (e) {
      console.error('[onboarding] starter pack', e);
    }

    try {
      await loadEverything();
    } catch {
      // ignore
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
    // Prefer ref so optimistic requires_visit updates are visible immediately.
    const tasksNow = tasksRef.current;
    const visibleForRoute = tasksNow.filter((t) => t.status !== 'done' && !isScheduledForLater(t, todayForRoute));
    const located = visibleForRoute
      .filter((t) =>
        isRouteStop(t, {
          bases: { home: homeCoords, work: workCoords },
          profile: {
            workType: userProfile.workType,
            travelEmphasis: userProfile.travelEmphasis,
          },
          personal: personalVisitEvidenceFromHistory(history, {
            home: homeCoords,
            work: workCoords,
          }),
        })
      )
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
  // V1.2: confirming also persists the relationship (alias → entity), so the
  // next time the user types that term it resolves without re-asking.
  function confirmResolution(c: JobLocationCandidate) {
    setConfirmedJobId(c.jobId);
    setConfirmedLocation({
      text: c.matchedField === 'location' && c.locationText ? c.locationText : c.jobName,
      lat: c.lat,
      lng: c.lng,
    });
    setDeclinedResolution(false);
    if (thought) {
      // Best-effort persistence: the task flow must never depend on the
      // memory write succeeding. On failure the relationship is simply not
      // learned this time (safe, explicit, and no silent pretending).
      const alias = deriveAliasTerm(thought, c);
      persistEntityAlias(alias, c.jobId).catch(() => {});
    }
  }

  function declineResolution() {
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(true);
  }

  // V1.2: writes the user-confirmed relationship (alias → entity) to the
  // entity_aliases table. Idempotent upsert keyed on (user_id, alias,
  // entity_type, entity_id), so re-confirming the same pairing just revives
  // it; a user can still hold the same alias for several entities (genuine
  // ambiguity). On success the in-memory memory is refreshed immediately so
  // the current thought resolves as 'known' without a reload.
  async function persistEntityAlias(alias: string, jobId: string) {
    if (!session) return;
    const normalized = alias.trim().toLowerCase();
    if (normalized.length === 0) return;
    const key = `job:${jobId}:${normalized}`;
    const upsert = await supabase
      .from('entity_aliases')
      .upsert(
        {
          user_id: session.user.id,
          alias: normalized,
          entity_type: 'job',
          entity_id: jobId,
          source: 'user_confirmed',
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,alias,entity_type,entity_id' }
      )
      .select('*')
      .single();
    if (upsert.error) {
      if (!loadedEntityAliasRows.current[key]) {
        console.error('Could not persist the confirmed entity relationship:', upsert.error.message);
      }
      return;
    }
    setEntityAliases((prev) => {
      const next = prev.filter((a) => !(a.alias === normalized && a.entityId === jobId));
      return [...next, { alias: normalized, entityType: 'job', entityId: jobId, active: true }];
    });
  }

  async function addTask(engineOverrides?: {
    text?: string;
    locationText?: string | null;
    jobId?: string | null;
    surfaceDate?: string | null;
    estimateMins?: number;
    originalInput?: string;
    explanation?: string;
    updateTaskId?: string;
    engineRequest?: import('@/lib/engine').EngineRequest;
    evidence?: import('@/lib/engine').LearningEvidence[];
    workingMemory?: import('@/lib/engine').WorkingMemorySnapshot;
  }) {
    const originalInput = (engineOverrides?.originalInput ?? taskText).trim();
    if (originalInput.length === 0) return;
    // Engine-structured docks already resolved place/job; skip job-confirm gate.
    if (!engineOverrides) {
      const gate = oneShotGate({
        rawText: originalInput,
        thought,
        locationResolution,
        declinedResolution,
        confirmedJobId,
      });
      if (!gate.ready) {
        setError(gate.blockReason || 'Confirm or skip the place first');
        return;
      }
    }
    const parsed = thought;
    // The action is the parsed intent when the thought carried consumable
    // facets; otherwise it is the raw text, unchanged. Engine overrides win.
    const text =
      engineOverrides?.text?.trim() ||
      (parsed && parsed.hadFacets && parsed.intent && parsed.intent.length > 0
        ? parsed.intent
        : originalInput);
    // One-shot: empty time is allowed (untimed work). Soft parse only when typed.
    const mins =
      engineOverrides?.estimateMins != null && engineOverrides.estimateMins > 0
        ? engineOverrides.estimateMins
        : taskTime.trim().length === 0
          ? 0
          : parseMins(taskTime);
    if (mins === null) {
      setError('Could not read that time, try 15m or 1.5h');
      return;
    }
    setError('');
    const userId = session.user.id;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    // A manual reminder date (explicit) wins over the parsed one; otherwise
    // the parsed date applies. Time is the parsed 'HH:MM', if any.
    const surfaceDate =
      engineOverrides?.surfaceDate !== undefined
        ? engineOverrides.surfaceDate
        : showReminderField && captureSurfaceDate.length > 0
          ? captureSurfaceDate
          : (parsed?.date ?? null);
    const intendedTime = parsed?.time ? parsed.time.label : null;
    // A confirmed resolution wins over a manual pick; both are explicit and
    // never co-occur for the same facet in practice.
    const jobId =
      engineOverrides?.jobId !== undefined
        ? engineOverrides.jobId
        : (confirmedJobId ?? captureJobId);
        // Unresolved road-phrase hints still belong on the task as free-text
    // location — even when no job matched and the user did not open the
    // location field. Never discard a place the user named.
    const locationText =
      engineOverrides?.locationText !== undefined
        ? engineOverrides.locationText
        : confirmedLocation && confirmedLocation.text.length > 0
          ? confirmedLocation.text
          : (captureLocation.trim().length > 0
              ? captureLocation.trim()
              : (parsed?.locationHint && parsed.locationHint.length > 0 ? parsed.locationHint : null));
    const lat = confirmedLocation?.lat != null ? confirmedLocation.lat : (captureLocationCoords?.lat ?? null);
    const lng = confirmedLocation?.lng != null ? confirmedLocation.lng : (captureLocationCoords?.lng ?? null);

    // Multi-turn refine: update the bound task instead of inserting another.
    // Never replace the title with the refinement utterance ("Actually I need it…").
    if (engineOverrides?.updateTaskId) {
      const patch: Record<string, unknown> = {
        location_text: locationText,
        job_id: jobId,
        surface_date: surfaceDate,
      };
      // A clock-time correction updates the existing task's distinct time
      // field. If this utterance only changes the date, omit intended_time so
      // the previous clock time is preserved rather than accidentally cleared.
      if (parsed?.time?.label) {
        patch.intended_time = parsed.time.label;
      }
      const refineLine = originalInput.trim();
      const looksLikeRefineUtterance =
        /^(?:actually|sorry|no[, ]|i\s+need\s+it|make\s+that)\b/i.test(refineLine) ||
        (engineOverrides.text?.trim() === refineLine);
      const existingTaskText = tasks.find((task) => task.id === engineOverrides.updateTaskId)?.text ?? '';
      const hasLegacyTemporalLocationSuffix =
        /\s+at\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this afternoon|next week)$/i.test(existingTaskText);
      const correctedTitleRemovesTemporalSuffix =
        !!engineOverrides.text &&
        hasLegacyTemporalLocationSuffix &&
        !/\s+at\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this afternoon|next week)$/i.test(engineOverrides.text);
      // A temporal correction must normally preserve the title. Exception:
      // clean up a known legacy parser defect that saved "at Monday" as part
      // of the title. This is a repair, not a title change requested by the user.
      if (engineOverrides.text && (!looksLikeRefineUtterance || correctedTitleRemovesTemporalSuffix)) {
        patch.text = engineOverrides.text;
      }
      if (mins > 0) patch.estimate_mins = mins;
      // PostgREST .single() throws "Cannot coerce the result into a single
      // JSON object" when the update returns zero visible rows (for example,
      // a stale task binding or an RLS-filtered row). Use maybeSingle so this
      // path can distinguish a database error from a missing update target.
      const { data: updated, error: updErr } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', engineOverrides.updateTaskId)
        .eq('user_id', userId)
        .select()
        .maybeSingle();
      if (updErr) {
        console.error('[capture] task update failed', {
          taskId: engineOverrides.updateTaskId,
          userId,
          code: updErr.code,
          message: updErr.message,
        });
        alert(updErr.message);
        return;
      }
      if (!updated) {
        console.error('[capture] task update matched no visible row', {
          taskId: engineOverrides.updateTaskId,
          userId,
        });
        alert("I couldn't confirm that task update. The task may have changed or the saved reference may be out of date. Your existing task has not been replaced.");
        return;
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === engineOverrides.updateTaskId ? { ...t, ...updated } : t))
      );
      if (engineOverrides.engineRequest) {
        const {
          bindRequestToTask,
          bindTaskToWorkingMemory,
          saveActiveRequestLocal,
          saveWorkingMemoryLocal,
          pushEngineStateRemote,
          loadWorkingMemoryLocal,
        } = await import('@/lib/engine');
        const bound = bindRequestToTask(engineOverrides.engineRequest, engineOverrides.updateTaskId);
        const memory = bindTaskToWorkingMemory(
          engineOverrides.workingMemory ?? loadWorkingMemoryLocal(userId),
          {
            taskId: engineOverrides.updateTaskId,
            taskText: String(updated?.text ?? engineOverrides.text ?? text),
            locationText: (updated?.location_text ?? locationText) as string | null,
            jobId: (updated?.job_id ?? jobId) as string | null,
            requestId: bound.id,
          }
        );
        saveActiveRequestLocal(bound, userId);
        saveWorkingMemoryLocal(memory, userId);
        void pushEngineStateRemote(
        supabase as never,
        userId,
        memory,
        bound,
        engineOverrides.evidence ?? []
      ).then(({ stateSaved, evidenceSaved }) => {
        if (!stateSaved) {
          console.warn('Dokkit engine context remote sync failed; account-scoped local cache remains active.');
        }
        if (!evidenceSaved) {
          console.warn('Dokkit learning evidence remote sync failed; local evidence cache remains active.');
        }
      });
      }
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
      setCaptureOpen(false);
      return;
    }

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

    // Bind engine request → task id so the next utterance can refine this row.
    if (engineOverrides?.engineRequest && data?.id) {
      const {
        bindRequestToTask,
        bindTaskToWorkingMemory,
        saveActiveRequestLocal,
        saveWorkingMemoryLocal,
        pushEngineStateRemote,
        loadWorkingMemoryLocal,
      } = await import('@/lib/engine');
      const bound = bindRequestToTask(engineOverrides.engineRequest, data.id);
      const memory = bindTaskToWorkingMemory(
        engineOverrides.workingMemory ?? loadWorkingMemoryLocal(userId),
        {
          taskId: data.id,
          taskText: String(data.text ?? engineOverrides.text ?? text),
          locationText: (data.location_text ?? locationText) as string | null,
          jobId: (data.job_id ?? jobId) as string | null,
          requestId: bound.id,
        }
      );
      saveActiveRequestLocal(bound, userId);
      saveWorkingMemoryLocal(memory, userId);
      void pushEngineStateRemote(
        supabase as never,
        userId,
        memory,
        bound,
        engineOverrides.evidence ?? []
      ).then(({ stateSaved, evidenceSaved }) => {
        if (!stateSaved) {
          console.warn('Dokkit engine context remote sync failed; account-scoped local cache remains active.');
        }
        if (!evidenceSaved) {
          console.warn('Dokkit learning evidence remote sync failed; local evidence cache remains active.');
        }
      });
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

    // If today is full, carry flexible work (often moves forward) to make room.
    // Anchors (due today / usually same-day) are never auto-moved.
    // Commitments + availability-aware remaining window so fit/overflow
    // respect meetings and calendar blocks, not just clock-to-work-end.
    const captureCommitments = buildDayCommitments({
      calendarEvents,
      meetings,
    });
    const workEndMinsCap = timeStringToMinutes(workEnd);
    const workStartMinsCap = timeStringToMinutes(workStart);
    const flatMeetingMins = meetings
      .filter((m) => m.source !== 'outlook' && !m.start_time)
      .reduce((sum, m) => sum + (m.duration_mins || 0), 0);
    const windowLeft = remainingTaskCapacityMins({
      now,
      workStartMins: workStartMinsCap,
      workEndMins: workEndMinsCap,
      isWorkDay,
      commitments: captureCommitments,
      flatBlockedMins: flatMeetingMins,
    });
    const overflowPlan = planOverflowCarry({
      runtime,
      openTasks: [...tasks.filter((x) => x.id !== data.id), data],
      history,
      clusters,
      remainingWindowMins: windowLeft,
      incomingCostMins: 0,
      protectId: data.id,
      workDays,
      commitments: captureCommitments,
      now,
      workEndMins: workEndMinsCap,
    });
    if (overflowPlan.carryIds.length > 0) {
      const carryDate = nextWorkSurfaceDate(new Date(), workDays);
      for (const id of overflowPlan.carryIds) {
        const { error: carryErr } = await supabase
          .from('tasks')
          .update({
            status: 'pending',
            started_at: null,
            surface_date: carryDate,
            due_today: false,
          })
          .eq('id', id);
        if (carryErr) console.error(carryErr);
      }
      setTasks((prev) =>
        prev.map((t) =>
          overflowPlan.carryIds.includes(t.id)
            ? {
                ...t,
                status: 'pending' as const,
                started_at: null,
                surface_date: carryDate,
                due_today: false,
              }
            : t
        )
      );
      if (overflowPlan.message) setRealityCheckMessage(overflowPlan.message);
    }

    if (data.lat != null && sortMode === 'geo_aware') recalcRoute();

    // Log the engine's prediction at capture time so it can be compared
    // against the actual outcome when the task completes. This is the
    // first half of the evidence feedback loop.
    const suggestion = suggestEstimate(
      text,
      history,
      clusters,
      estimateContextFrom(
        {
          jobId: confirmedJobId ?? captureJobId,
          locationText: confirmedLocation?.text ?? null,
        },
        now
      )
    );
    logCapturePrediction({
      userId,
      taskId: data.id,
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
    lng: number | null,
    requiresVisit?: boolean | null
  ) {
    const payload: Record<string, unknown> = {
      text,
      estimate_mins: mins,
      surface_date: surfaceDate,
      location_text: locationText,
      lat,
      lng,
    };
    if (requiresVisit !== undefined) {
      payload.requires_visit = requiresVisit;
    }
    const { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not save your changes: ' + error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              text,
              estimate_mins: mins,
              surface_date: surfaceDate,
              location_text: locationText,
              lat,
              lng,
              requires_visit:
                requiresVisit !== undefined ? requiresVisit : t.requires_visit,
            }
          : t
      )
    );
    if (sortMode === 'geo_aware') recalcRoute();
  }

  async function setRouteIntent(id: string, requiresVisit: boolean | null) {
    const previous = tasksRef.current.find((t) => t.id === id)?.requires_visit ?? null;
    // Optimistic local update (ref + state) so route membership flips now.
    tasksRef.current = tasksRef.current.map((t) =>
      t.id === id ? { ...t, requires_visit: requiresVisit } : t
    );
    setTasks(tasksRef.current);
    if (sortMode === 'geo_aware') void recalcRoute();

    const { error } = await supabase
      .from('tasks')
      .update({ requires_visit: requiresVisit })
      .eq('id', id);
    if (error) {
      console.error(error);
      tasksRef.current = tasksRef.current.map((t) =>
        t.id === id ? { ...t, requires_visit: previous } : t
      );
      setTasks(tasksRef.current);
      if (sortMode === 'geo_aware') void recalcRoute();
      const msg = String((error as { message?: string }).message || error);
      alert(
        /requires_visit|PGRST204|schema cache/i.test(msg)
          ? 'Travel preference needs the requires_visit column. Run 20260930_task_requires_visit.sql in Supabase, then try again.'
          : 'Could not save travel preference: ' + msg
      );
    }
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
    const task = tasks.find((t) => t.id === id);
    const startedAt = new Date().toISOString();
    const { error } = await supabase.from('tasks').update({ status: 'active', started_at: startedAt, near_notified: false, over_notified: false, last_overdue_ping_at: null }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not start the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'active', started_at: startedAt } : t)));
    // Fire OS notification immediately (same turn as the Start tap).
    if (task) {
      void showActiveTimerNotification({
        taskId: id,
        text: task.text,
        startedAt,
        estimateMins: task.estimate_mins || 0,
        loggedMins: task.logged_mins || 0,
        urgent: true,
      });
    }
    notifyTaskActivity({
      type: 'started',
      taskId: id,
      text: task?.text,
      startedAt,
      estimateMins: task?.estimate_mins || 0,
      loggedMins: task?.logged_mins || 0,
    });
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
    notifyTaskActivity({
      type: 'stopped',
      taskId: id,
      logged_mins: newLogged,
      text: task.text,
    });
  }


  async function applyRealityUpdates(updates: RealityUpdate[]) {
    if (!session) return;
    setRealityCheckBusy(true);
    const carryDate = nextWorkSurfaceDate(new Date(), workDays);
    const summary = summarizeReshape(updates);
        try {
      for (const u of updates) {
        const task = tasks.find((t) => t.id === u.taskId);
        if (!task) continue;

        // Reality → history (Done only for duration). Partial/Carry/Skip never train duration (FP-0).
        const observation = historyObservationForUpdate(task, u);
        if (observation) {
          setHistory((prev) => [observation, ...prev]);
        }

        if (u.outcome === 'done') {
          let finalLogged = task.logged_mins;
          if (task.status === 'active' && task.started_at) {
            finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
          }
          const measured =
            u.actualMins != null ? u.actualMins : Math.round(finalLogged);
          const loop = closeCompletionLoop({
            userId: session?.user?.id,
            taskId: task.id,
            taskText: task.text,
            estimateMins: task.estimate_mins,
            measuredMins: measured,
            history,
            clusters,
            outcomeKind: 'done',
            realityOutcome: 'done',
            startedAt: task.started_at ?? null,
            activeMinutes: measured > 0 ? measured : null,
            hints: {
              estimateMins: task.estimate_mins,
              loggedMins: measured,
              jobId: task.job_id,
              dueToday: task.due_today,
              intendedTime: task.intended_time,
              createdAt: task.created_at,
              surfaceDate: task.surface_date,
              subtaskCount: subtasksByTask[task.id]?.length ?? 0,
            },
          });
          const actualForDb = loop.actualForDb > 0 ? loop.actualForDb : measured;
          const { error } = await supabase
            .from('tasks')
            .update({
              status: 'done',
              started_at: null,
              logged_mins: actualForDb,
              actual_mins: loop.trainMins ?? (actualForDb > 0 ? actualForDb : null),
              completed_at: new Date().toISOString(),
            })
            .eq('id', u.taskId);
          if (error) {
            console.error(error);
            alert('Could not update a task: ' + error.message);
            return;
          }
          setTasks((prev) => prev.filter((t) => t.id !== u.taskId));
        } else if (u.outcome === 'partial') {
          let spent = task.logged_mins;
          if (task.status === 'active' && task.started_at) {
            spent += (Date.now() - new Date(task.started_at).getTime()) / 60000;
          }
          spent = u.actualMins != null ? u.actualMins : Math.round(spent);
          const remaining = u.remainingMins ?? Math.max(5, Math.round(task.estimate_mins / 2));
          const totalObserved = spent + remaining;

          const { error } = await supabase
            .from('tasks')
            .update({
              status: 'pending',
              started_at: null,
              logged_mins: spent,
              estimate_mins: remaining,
              surface_date: carryDate,
              due_today: false,
            })
            .eq('id', u.taskId);
          if (error) {
            console.error(error);
            alert('Could not update a task: ' + error.message);
            return;
          }
          setTasks((prev) =>
            prev.map((t) =>
              t.id === u.taskId
                ? {
                    ...t,
                    status: 'pending' as const,
                    started_at: null,
                    logged_mins: spent,
                    estimate_mins: remaining,
                    surface_date: carryDate,
                    due_today: false,
                  }
                : t
            )
          );
          if (spent > 0) {
            // Train on time actually spent — not spent+remaining (remaining is still plan).
            closeCompletionLoop({
              userId: session?.user?.id,
              taskId: task.id,
              taskText: task.text,
              estimateMins: task.estimate_mins,
              measuredMins: spent,
              history,
              clusters,
              outcomeKind: 'partial',
              realityOutcome: 'partial',
              startedAt: task.started_at ?? null,
              activeMinutes: spent > 0 ? spent : null,
              hints: {
                estimateMins: task.estimate_mins,
                loggedMins: spent,
                jobId: task.job_id,
                dueToday: task.due_today,
                intendedTime: task.intended_time,
                createdAt: task.created_at,
                surfaceDate: task.surface_date,
                subtaskCount: subtasksByTask[task.id]?.length ?? 0,
              },
            });
          }
        } else if (u.outcome === 'carried' || u.outcome === 'skipped') {
          const { error } = await supabase
            .from('tasks')
            .update({
              status: 'pending',
              started_at: null,
              surface_date: carryDate,
              due_today: false,
            })
            .eq('id', u.taskId);
          if (error) {
            console.error(error);
            alert('Could not update a task: ' + error.message);
            return;
          }
          setTasks((prev) =>
            prev.map((t) =>
              t.id === u.taskId
                ? {
                    ...t,
                    status: 'pending' as const,
                    started_at: null,
                    surface_date: carryDate,
                    due_today: false,
                  }
                : t
            )
          );
        }
      }
          setRealityCheckOpen(false);
    setRealityCheckMessage(summary.message);
    saveDayClose({
      date: localDateStr(new Date()),
      doneCount: summary.doneCount,
      carriedCount: summary.carriedCount,
      skippedCount: summary.skippedCount,
      message: summary.message,
    });
    } finally {
      setRealityCheckBusy(false);
    }
  }

  async function completeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    let finalLogged = task ? task.logged_mins : 0;
    if (task && task.status === 'active' && task.started_at) {
      finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }
    const measured = Math.round(finalLogged);
    const skipLearn = task ? isStarterTask(task) : false;
    const loop = skipLearn
      ? { actualForDb: 0, trainMins: null as number | null, source: 'none' as const }
      : closeCompletionLoop({
          userId: session?.user?.id,
          taskId: task?.id ?? null,
          taskText: task?.text || '',
          estimateMins: task?.estimate_mins || 0,
          measuredMins: measured,
          history,
          clusters,
          outcomeKind: 'done',
          realityOutcome: 'done',
          startedAt: task?.started_at ?? null,
          activeMinutes: measured > 0 ? measured : null,
          hints: {
            estimateMins: task?.estimate_mins,
            loggedMins: measured,
            jobId: task?.job_id,
            dueToday: task?.due_today,
            intendedTime: task?.intended_time,
            createdAt: task?.created_at,
            surfaceDate: task?.surface_date,
            subtaskCount: task ? (subtasksByTask[task.id]?.length ?? 0) : 0,
          },
        });
    const actualForDb = loop.actualForDb;
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'done',
        started_at: null,
        logged_mins: finalLogged,
        actual_mins: actualForDb > 0 ? actualForDb : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not complete the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (task && loop.trainMins != null) {
      setHistory((prev) => [
        historyRowFromCompletion(task, loop.trainMins!, measured, {
          subtask_count: subtasksByTask[task.id]?.length ?? 0,
        }),
        ...prev,
      ]);
    }
    if (task?.lat != null && sortMode === 'geo_aware') recalcRoute();
    notifyTaskActivity({ type: 'completed', taskId: id });
  }


  async function confirmPostStopDone() {
    if (!postStopPrompt) return;
    setPostStopBusy(true);
    try {
      await completeTask(postStopPrompt.taskId);
      setPostStopPrompt(null);
    } finally {
      setPostStopBusy(false);
    }
  }

  function dismissPostStopPrompt() {
    setPostStopPrompt(null);
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

  /** List-as-task ops for speech capture (tasks + subtasks, not collections). */
  const listOps: TaskListOps | null = session?.user?.id
    ? {
        listTasks: (): ListTaskCandidate[] =>
          tasks.map((t) => ({
            id: t.id,
            text: t.text,
            info: t.info,
            jobId: t.job_id,
            jobName: jobs.find((j) => j.id === t.job_id)?.name ?? null,
          })),
        createListTask: async (title: string, itemTexts: string[], opts) => {
          const userId = session.user.id;
          const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              user_id: userId,
              text: title,
              estimate_mins: 0,
              due_today: false,
              source: 'came_up',
              order_index: maxOrder + 1,
              info: LIST_TASK_MARKER,
              original_input: opts?.originalInput ?? title,
              job_id: opts?.jobId ?? null,
              location_text: opts?.locationText ?? null,
            })
            .select()
            .single();
          if (error || !data) {
            console.error(error);
            return null;
          }
          setTasks((prev) => [...prev, data]);
          if (itemTexts.length > 0) {
            const rows = itemTexts.map((text, i) => ({
              user_id: userId,
              task_id: data.id,
              text,
              mins: 0,
              order_index: i,
            }));
            const { data: subData, error: subErr } = await supabase
              .from('subtasks')
              .insert(rows)
              .select();
            if (subErr) {
              console.error(subErr);
            } else if (subData) {
              setSubtasksByTask((prev) => ({ ...prev, [data.id]: subData }));
            }
          }
          return { taskId: data.id, title: data.text };
        },
        appendSubtasks: async (taskId: string, itemTexts: string[]) => {
          const userId = session.user.id;
          const existing = subtasksByTask[taskId] || [];
          const rows = itemTexts.map((text, i) => ({
            user_id: userId,
            task_id: taskId,
            text,
            mins: 0,
            order_index: existing.length + i,
          }));
          const { data, error } = await supabase.from('subtasks').insert(rows).select();
          if (error) {
            console.error(error);
            return 0;
          }
          if (data) {
            setSubtasksByTask((prev) => ({
              ...prev,
              [taskId]: [...(prev[taskId] || []), ...data],
            }));
          }
          return data?.length ?? 0;
        },
        completeSubtasks: async (taskId: string, refs: string[]) => {
          const subs = subtasksByTask[taskId] || [];
          const ids = matchSubtaskRefs(subs, refs);
          if (ids.length === 0) return 0;
          const { error } = await supabase.from('subtasks').update({ done: true }).in('id', ids);
          if (error) {
            console.error(error);
            return 0;
          }
          setSubtasksByTask((prev) => ({
            ...prev,
            [taskId]: (prev[taskId] || []).map((s) =>
              ids.includes(s.id) ? { ...s, done: true } : s
            ),
          }));
          return ids.length;
        },
        removeSubtasks: async (taskId: string, refs: string[]) => {
          const subs = subtasksByTask[taskId] || [];
          const ids = matchSubtaskRefs(subs, refs);
          if (ids.length === 0) return 0;
          const { error } = await supabase.from('subtasks').delete().in('id', ids);
          if (error) {
            console.error(error);
            return 0;
          }
          setSubtasksByTask((prev) => ({
            ...prev,
            [taskId]: (prev[taskId] || []).filter((s) => !ids.includes(s.id)),
          }));
          return ids.length;
        },
        openTask: (taskId: string) => {
          setCaptureOpen(false);
          setExpandedId(null);
          setOpenTaskId(taskId);
        },
        getSubtaskTexts: async (taskId: string) => {
          return (subtasksByTask[taskId] || []).map((s) => s.text);
        },
      }
    : null;

  // Parent (app/page.tsx) only mounts Today when session is established.

  // Travel presence for capacity (authenticated user only; RLS + user_id filter).
  useEffect(() => {
    if (!session?.user?.id) {
      setTravelStopsToday([]);
      return;
    }
    const uid = session.user.id;
    let cancelled = false;
    void (async () => {
      const todayStr = travelLocalDateStr();
      const { data: trip } = await supabase
        .from('trips')
        .select('id')
        .eq('user_id', uid)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!trip) {
        setTravelStopsToday([]);
        return;
      }
      const { data: dayRow } = await supabase
        .from('trip_days')
        .select('id')
        .eq('trip_id', trip.id)
        .eq('date', todayStr)
        .maybeSingle();
      if (cancelled) return;
      if (!dayRow) {
        setTravelStopsToday([]);
        return;
      }
      const { data: acts } = await supabase
        .from('activities')
        .select('id, text, status, stop_kind, presence, estimate_mins, job_id')
        .eq('trip_day_id', dayRow.id)
        .eq('user_id', uid);
      if (cancelled) return;
      setTravelStopsToday(acts || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);


  // Soft Reality Check eligibility note — must run before any early return (hooks rules).
  // Never opens the sheet; only records that tomorrow may offer a calm card.
  useEffect(() => {
    if (!session) return;
    if (tasks.length === 0) return;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const endMins = timeStringToMinutes(workEnd);
    const startMins = timeStringToMinutes(workStart);
    const day = now.getDay();
    const onWorkDay = workDays.includes(day);
    const minsLeft = onWorkDay ? Math.max(endMins - nowMins, 0) : 0;
    const inWindow =
      tasksForRealityCheck(tasks).length > 0 &&
      (onWorkDay ? minsLeft <= 30 : true);
    if (!inWindow) return;
    noteOpenRealityWindow(localDateStr(now), tasksForRealityCheck(tasks).length);
  }, [session, tasks, workEnd, workStart, workDays]);

  if (!session) return null;



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

  function remainingForTask(t: Task): number {
    return remainingForTaskPure(t, subtasksByTask, now.getTime());
  }

  function effectiveRemainingForTask(t: Task): number {
    return effectiveRemainingForTaskPure(t, subtasksByTask, history, clusters, runtime, now.getTime());
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
  const todayDow = now.getDay();
  const isWorkDay = workDays.includes(todayDow);

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workStartMinutes = timeStringToMinutes(workStart);
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = isWorkDay ? Math.max(workEndMinutes - nowMinutesOfDay, 0) : 0;

  // Reality Check: offer while timed Today work is still open and the day is
  // winding down (last 2h of the work window, or any time after work end / off day).
  // Uses visibleTasks only — scheduled-for-later work does not trigger the offer.
  const REALITY_CHECK_WINDOW_MINS = 120;
  const hasOpenTimedWork = visibleTasks.some(
    (t) => t.status !== 'done' && t.estimate_mins > 0
  );
  const pastWorkEnd = isWorkDay && nowMinutesOfDay >= workEndMinutes;
  const showRealityCheck =
    hasOpenTimedWork &&
    (!isWorkDay || pastWorkEnd || minutesLeftToday <= REALITY_CHECK_WINDOW_MINS);


  // External commitments only consume capacity while they overlap the time
  // remaining in the workday: an ended commitment stops blocking, one that
  // hasn't started yet does not reduce time already spent, and all-day
  // events span the whole window. This replaces the old flat subtraction
  // that counted every meeting's full duration regardless of when it runs.
  // Timed meetings + calendar events share one commitment list so fit,
  // capacity, and overflow all see the same pressure.
  const dayCommitments = buildDayCommitments({
    calendarEvents,
    meetings: todayMeetings,
  });
  const availability = computeAvailability({
    now,
    workStartMins: workStartMinutes,
    workEndMins: workEndMinutes,
    isWorkDay,
    commitments: dayCommitments,
  });
  // Only untimed manual meetings remain as a flat subtractor (no interval).
  const untimedManualMins = todayMeetings
    .filter((m) => m.source !== 'outlook' && !m.start_time)
    .reduce((sum, m) => sum + m.duration_mins, 0);
  const taskCapacity = availability.availableMinutes - untimedManualMins;

  const geoAware = sortMode === 'geo_aware';
  const visitOpts = {
    bases: { home: homeCoords, work: workCoords },
    profile: {
      workType: userProfile.workType,
      travelEmphasis: userProfile.travelEmphasis,
    },
    personal: personalVisitEvidenceFromHistory(history, {
      home: homeCoords,
      work: workCoords,
    }),
  };

  const currentBase = geoAware ? determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords) : { coords: null, label: null };

  let ordered: Task[];
  try {
    if (geoAware && currentBase.coords) {
      const locatedForOrder = visibleTasks
        .filter((t) => isRouteStop(t, visitOpts))
        .map((t) => ({ id: t.id, lat: t.lat as number, lng: t.lng as number }));
      const structuralOrder = [...visibleTasks].sort((a, b) => a.order_index - b.order_index);
      const geoIds = nearestNeighborOrder(currentBase.coords, locatedForOrder);
      ordered = weaveGeoOrder(structuralOrder as any, geoIds) as Task[];
    } else if (geoAware) {
      // geo_aware selected but no base configured — falls back to manual
      // order rather than pretending a route exists.
      ordered = sortTasks(visibleTasks, 'manual');
    } else {
      const preferredOrderIds =
        sortMode === 'capacity_first'
          ? sequenceOrderIdsForOpenTasks({
              openTasks: visibleTasks.filter((t) => t.status !== 'done'),
              history,
              clusters,
              runtime,
              remainingWindowMins: taskCapacity,
              commitments: dayCommitments,
              now,
              workEndMins: workEndMinutes,
            })
          : null;
      ordered = sortTasks(
        visibleTasks,
        sortMode,
        effectiveRemainingForTask,
        taskCapacity,
        preferredOrderIds
      );
    }
  } catch (err) {
    console.error('[TodayPage] order/fit failed', err);
    ordered = sortTasks(visibleTasks, 'manual');
  }
  // Guard: weaveGeoOrder must never leave holes (visit-intent vs lat/lng mismatch).
  ordered = ordered.filter((t): t is Task => t != null && typeof t.id === 'string');
  const orderedIds = ordered.map((t) => t.id);

  // Route drive time only enters capacity math in geo_aware mode. Each
  // located task carries its own outgoing leg's drive_mins_to_next (the
  // last located task carries the return leg back to the start), and the
  // origin → first leg is held in driveFromBaseMins.
  const locatedDriveSum = geoAware
    ? visibleTasks
        .filter((t) => isRouteStop(t, visitOpts))
        .reduce((sum, t) => sum + (t.drive_mins_to_next || 0), 0)
    : 0;
  const routeDriveMins = geoAware ? driveFromBaseMins + locatedDriveSum : 0;

  // The located destinations in on-screen (geo) order. Leg rows and the
  // route map both render from this sequence.
  const locatedInOrder = ordered.filter((t) => isRouteStop(t, visitOpts));
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
  const workWindowMins = Math.max(workEndMinutes - workStartMinutes, 1);
  const travelImpact = computeTravelPresenceImpact(
    travelStopsToday,
    minutesLeftToday,
    workWindowMins
  );
  const travelBlockedMins = travelImpact.blockedMins;
  // Timed meetings already sit inside availability.blockedMinutes via dayCommitments.
  const remainingWorkMins =
    availability.blockedMinutes +
    untimedManualMins +
    remainingTaskMins +
    routeDriveMins +
    travelBlockedMins;

  // Today is the integrator: manual meetings and calendar commitments are
  // represented together so the day shows the same time object the Meetings
  // surface owns, rather than silently treating meetings as capacity only.
  const activeCommitments = [
    ...calendarEvents
      .filter((e) => new Date(e.end_at).getTime() > now.getTime())
      .map((e) => ({
        ...e,
        kind: 'calendar' as const,
      })),
    ...todayMeetings
      .filter((m) => m.source !== 'outlook' && Boolean(m.start_time))
      .map((m) => {
        const start = new Date(m.start_time!);
        const end = new Date(start.getTime() + m.duration_mins * 60000);
        return {
          id: `meeting-${m.id}`,
          title: m.text || 'Meeting',
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: false,
          href: `/meetings/${m.id}`,
          kind: 'meeting' as const,
          jobLabel: m.job_id
            ? jobs.find((j) => j.id === m.job_id)?.name ?? null
            : null,
        };
      }),
  ].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const overloaded = isWorkDay && minutesLeftToday > 0 && remainingWorkMins > minutesLeftToday;

  let cumulative = 0;

  const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateOnlyLabel = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const trackSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const nowPercent = Math.min(Math.max((nowMinutesOfDay - workStartMinutes) / trackSpan, 0), 1);
  const projectedFinishMinutes = nowMinutesOfDay + remainingWorkMins;
  const projectedPercent = (projectedFinishMinutes - workStartMinutes) / trackSpan;
  const planWidthPercent = Math.max(Math.min(projectedPercent, 1) - nowPercent, 0);



  const liveDayPlan = buildLiveDayPlan({
    now,
    openTasks: ordered.filter((x) => x.status !== 'done'),
    orderedIds: ordered.filter((x) => x.status !== 'done').map((x) => x.id),
    history,
    runtime: runtime,
    remainingWindowMins: Math.max(taskCapacity, 0),
    commitments: dayCommitments,
    workEndMins: workEndMinutes,
    remainingWorkMins,
  });
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

  const openVisible = visibleTasks.filter((x) => x.status !== 'done');
  const timedOpen = openVisible.filter((x) => x.estimate_mins > 0).length;
  const jobIdsWithOpen = new Set(
    openVisible.map((x) => x.job_id).filter(Boolean) as string[]
  );
  const nextCommitment = (() => {
    const nowMs = Date.now();
    const upcoming = activeCommitments
      .filter((c) => !c.all_day && new Date(c.end_at).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    const c = upcoming[0];
    if (!c) return null;
    const start = new Date(c.start_at);
    const when = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    return { title: c.title, when };
  })();
  const travelSummary =
    geoAware && hasRoute && routeDriveMins > 0
      ? `~${fmtMins(routeDriveMins)} driving`
      : geoAware && hasRoute
        ? 'Route set'
        : null;
  const sortModeLabel =
    sortMode === 'capacity_first'
      ? 'Ordered by fit'
      : sortMode === 'geo_aware'
        ? 'Route-aware'
        : null;
  const openTaskSubs = openTask
    ? subtasksByTask[openTask.id] || []
    : [];
  const deskContext = isDesktop
    ? openTask
      ? {
          mode: 'task' as const,
          openCount: openVisible.length,
          timedCount: timedOpen,
          taskRemainingMins: openTaskRemaining,
          taskEstimateMins: openTask.estimate_mins,
          taskJobName:
            jobs.find((j) => j.id === openTask.job_id)?.name ?? null,
          taskPlace: openTask.location_text || null,
          taskActive: openTask.status === 'active',
          taskSubsDone: openTaskSubs.filter((s) => s.done).length,
          taskSubsTotal: openTaskSubs.length,
        }
      : {
          mode: 'day' as const,
          openCount: openVisible.length,
          timedCount: timedOpen,
          nextCommitment,
          jobsWithOpen: jobIdsWithOpen.size,
          meetingsToday: todayMeetings.length,
          travelSummary,
          // No engine-facing sort labels in the header.
          sortModeLabel: null,
        }
    : null;

  const usableMins = Math.max(taskCapacity, 0);
  const fixedMins =
    availability.blockedMinutes + untimedManualMins;
  const fitsNow = ordered
    .filter((x) => x.status !== 'done')
    .slice(0, 3)
    .map((x) => x.text.trim())
    .filter(Boolean);
  const dayRead = !isWorkDay
    ? 'Outside your usual working days.'
    : overloaded
      ? 'Remaining work no longer fits today.'
      : remainingTaskMins <= 0 && openVisible.length === 0
        ? "You're clear for the rest of today."
        : remainingTaskMins <= 0
          ? 'No timed work left — list items can still be cleared.'
          : usableMins > remainingWorkMins + 30
            ? 'You have room for another task.'
            : remainingWorkMins > usableMins
              ? 'Your afternoon is getting tighter.'
              : 'Your day is on track.';
  const workSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const commitmentMarkers = activeCommitments
    .filter((c) => !c.all_day)
    .map((c) => {
      const start = new Date(c.start_at);
      const end = new Date(c.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const sMins = start.getHours() * 60 + start.getMinutes();
      const eMins = end.getHours() * 60 + end.getMinutes();
      const clampedStart = Math.max(sMins, workStartMinutes);
      const clampedEnd = Math.min(eMins, workEndMinutes);
      if (clampedEnd <= clampedStart) return null;
      return {
        startPct: (clampedStart - workStartMinutes) / workSpan,
        endPct: (clampedEnd - workStartMinutes) / workSpan,
        label: c.title || 'Fixed',
      };
    })
    .filter((x): x is { startPct: number; endPct: number; label: string } => x != null)
    .slice(0, 8);

  const dayDepth = isDesktop
    ? {
        clockRemainingMins: minutesLeftToday,
        usableMins,
        fixedMins,
        plannedTaskMins: remainingTaskMins,
        travelMins: routeDriveMins,
        fitsNow,
        dayRead,
        commitmentMarkers,
      }
    : null;

  return (
    <div
      className={`app-shell${isDesktop && openTask ? " has-desk-detail" : ""}`}
      style={
        isDesktop
          ? ({ ['--desk-list-w' as string]: `${deskListWidth}px` } as React.CSSProperties)
          : undefined
      }
    >
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
        routeDriveMins={routeDriveMins}
        onViewMap={() => setMapOpen(true)}
        userId={session.user.id}
        commitments={activeCommitments}
        onRealityCheck={() => setRealityCheckOpen(true)}
        showRealityCheck={showRealityCheck}
        realityCheckMessage={realityCheckMessage}
        isDesktop={isDesktop}
        onDockIt={isDesktop ? () => setCaptureOpen(true) : undefined}
        orderHint={dayOrderHint({
          sortMode,
          personalEvidenceCount: history.filter(
            (h) => typeof h.actual_mins === 'number' && h.actual_mins > 0
          ).length,
        })}
        deskContext={deskContext}
        dayDepth={dayDepth}
      />



<div className="task-list">
      {postStopPrompt && (
        <PostStopPrompt
          prompt={postStopPrompt}
          busy={postStopBusy}
          onDone={confirmPostStopDone}
          onStillGoing={dismissPostStopPrompt}
        />
      )}

        {taskLoadError ? (
          <div className="empty-state">
            <div className="empty-state-title">Couldn't load your tasks.</div>
            <div className="empty-state-sub">{taskLoadError}</div>
          </div>
        ) : (
          ordered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">{todayEmptyCopy(userProfile).title}</div>
              <div className="empty-state-sub">
                {todayEmptyCopy(userProfile).sub}
              </div>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="btn btn-steel"
                  onClick={() => setCaptureOpen(true)}
                >
                  <PlusIcon size={16} /> Add
                </button>
                {showRealityCheck ? (
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setRealityCheckOpen(true)}
                  >
                    Reality check
                  </button>
                ) : null}
              </div>
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

          const suggestion =
            t.estimate_mins > 0
              ? suggestEstimate(t.text, history, clusters, estimateContextFrom(t, now))
              : null;
          const learnedHint =
            suggestion && hasMeaningfulDivergence(t.estimate_mins, suggestion.suggestedMins)
              ? fmtMins(suggestion.suggestedMins)
              : null;

          // In geo_aware mode, located tasks render their drive legs as
          // distinct rows between the destinations they connect — an
          // origin→first leg before the first located task, a leg between
          // each located task, and the return leg after the last one.
          const isLocated = isRouteStop(t, visitOpts);
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
                  fitLabel={liveDayPlan.byId[t.id]?.fitLabel ?? null}
                  fitReason={liveDayPlan.byId[t.id]?.reason ?? null}
                  anyActive={anyActive}
                  subs={subs}
                  learnedHint={learnedHint}
                  jobLabel={jobs.find((j) => j.id === t.job_id)?.name ?? null}
                  expanded={isDesktop ? openTaskId === t.id : expandedId === t.id}
                  onToggleExpand={() => {
                    if (isDesktop) {
                      setExpandedId(null);
                      setOpenTaskId((cur) => (cur === t.id ? null : t.id));
                    } else {
                      setExpandedId((cur) => (cur === t.id ? null : t.id));
                    }
                  }}
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
                  label={fmtMins(t.drive_mins_to_next)}
                  detail={
                    locatedIdx === locatedInOrder.length - 1
                      ? `Back to ${returnLabel ?? originLabel}`
                      : locatedInOrder[locatedIdx + 1]
                        ? `To ${locatedInOrder[locatedIdx + 1].text}`
                        : 'To next stop'
                  }
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

      {tasks.some((t) => isStarterTask(t)) && (
        <div className="reality-invite-card starter-pack-banner" role="region" aria-label="Example tasks">
          <p className="reality-invite-kicker">Examples</p>
          <p className="reality-invite-body">
            A few sample items so Today isn&apos;t empty. They never train Dokkit&apos;s learning.
          </p>
          <div className="reality-invite-actions">
            <button
              type="button"
              className="btn-text"
              disabled={clearingStarter}
              onClick={async () => {
                if (!session?.user?.id) return;
                setClearingStarter(true);
                try {
                  await clearStarterPack(supabase, session.user.id);
                  setTasks((prev) => prev.filter((x) => !isStarterTask(x)));
                } finally {
                  setClearingStarter(false);
                }
              }}
            >
              {clearingStarter ? 'Removing…' : 'Clear examples'}
            </button>
          </div>
        </div>
      )}

      {!setupLineDismissed &&
        firstSessionLine(userProfile) &&
        history.length === 0 &&
        tasks.filter((t) => !isStarterTask(t)).length === 0 && (
        <div className="reality-invite-card" role="status">
          <p className="reality-invite-body" style={{ marginBottom: 8 }}>
            {firstSessionLine(userProfile)}
          </p>
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              markSetupLineSeen();
              setSetupLineDismissed(true);
            }}
          >
            Got it
          </button>
        </div>
      )}

      {pendingRealityInvite && !realityCheckOpen && (
        <div className="reality-invite-card" role="region" aria-label="Reality check">
          <p className="reality-invite-kicker">Yesterday</p>
          <p className="reality-invite-body">
            {pendingRealityInvite.taskCount === 1
              ? 'One thing may still be open from yesterday.'
              : `${pendingRealityInvite.taskCount} things may still be open from yesterday.`}
          </p>
          <div className="reality-invite-actions">
            <button
              type="button"
              className="btn btn-steel"
              onClick={() => {
                dismissPendingRealityInvite(pendingRealityInvite.forDate);
                setPendingRealityInvite(null);
                setRealityCheckOpen(true);
              }}
            >
              Review
            </button>
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                dismissPendingRealityInvite(pendingRealityInvite.forDate);
                setPendingRealityInvite(null);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {realityCheckOpen && (
        <RealityCheckSheet
          tasks={tasksForRealityCheck(tasks)}
          busy={realityCheckBusy}
          onClose={() => setRealityCheckOpen(false)}
          onReshape={applyRealityUpdates}
        />
      )}

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
          confirmedJobId={confirmedJobId}
          durationExplain={captureDurationExplain}
          error={error}
          onClose={() => setCaptureOpen(false)}
          userId={session?.user?.id ?? null}
          listOps={listOps}
          listTasks={tasks.map((t) => ({
            id: t.id,
            text: t.text,
            info: t.info,
            jobId: t.job_id,
            jobName: jobs.find((j) => j.id === t.job_id)?.name ?? null,
          }))}
          addTaskWithOverrides={async (o) => {
            await addTask(o);
            return null;
          }}
          remainingMinsToday={Math.max(0, minutesLeftToday - remainingWorkMins)}
          dockMeetings={[
            ...todayMeetings.map((m) => ({
              id: m.id,
              text: m.text,
              startAt: m.start_time,
            })),
            ...calendarEvents
              .filter((e) => {
                try {
                  return localDateStr(new Date(e.start_at)) === todayStr;
                } catch {
                  return false;
                }
              })
              .map((e) => ({
                id: e.id,
                text: e.title || 'Calendar',
                startAt: e.start_at,
              })),
          ]}
          travelMins={routeDriveMins > 0 ? routeDriveMins : null}
        />
      )}

      {isDesktop ? (
        <button
          type="button"
          className="desk-split-handle"
          aria-label="Resize task list"
          onPointerDown={(e) => {
            e.preventDefault();
            deskSplitDragging.current = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
        />
      ) : null}

      {openTask && (
        <TaskDetailSheet
          presentation={isDesktop ? 'pane' : 'sheet'}
          showTravelPref={sortMode === 'geo_aware'}
          task={openTask}
          subs={subtasksByTask[openTask.id] || []}
          remainingForThis={openTaskRemaining}
          liveLogged={openTaskLiveLogged}
          anyActive={visibleTasks.some((x) => x.status === 'active' && x.estimate_mins > 0)}
          context="today"
          jobs={jobs}
          meetings={meetings}
          estimateSuggestion={suggestEstimate(
            openTask.text,
            history,
            clusters,
            estimateContextFrom(openTask, now)
          )}
          siblingTasks={
            openTask.job_id
              ? tasks
                  .filter((t) => t.job_id === openTask.job_id && t.status !== 'done')
                  .map((t) => ({ id: t.id, text: t.text, status: t.status }))
              : []
          }
          onOpenSibling={(id) => setOpenTaskId(id)}
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
          title="Today's order"
          subtitle={
            locatedInOrder.length === 0
              ? undefined
              : [
                  `${locatedInOrder.length} stop${locatedInOrder.length === 1 ? '' : 's'}`,
                  routeDriveMins > 0 ? `about ${fmtMins(routeDriveMins)} driving` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
        />
      )}

      <SurfaceNav
        active="today"
        onNavigate={(s: Surface) => recordEvent(s, true)}
        onAdd={captureOpen ? undefined : () => setCaptureOpen(true)}
        addLabel="Dock it"
        sectionOrder={orderedNavSurfaces(userProfile)}
      />
    </div>
  );
}