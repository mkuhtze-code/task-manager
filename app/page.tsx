'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';
import { TaskCard } from '@/components/TaskCard';
import { TravelLeg } from '@/components/TravelLeg';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { ScheduledSheet } from '@/components/ScheduledSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import { TodayHeader } from '@/components/TodayHeader';
import MapView from '@/components/MapView';
import { AuthScreen, OnboardingScreen } from '@/components/AuthScreen';
import { PlusIcon, StopIcon } from '@/components/icons';
import { useDragReorder } from '@/hooks/useDragReorder';
import {
  buildClusters,
  suggestEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
  suggestLocation,
  suggestsLocation,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { determineBase, nearestNeighborOrder, weaveGeoOrder, type Coords } from '@/lib/todayRoute';
import { sortTasks } from '@/lib/taskSort';
import { authedFetch } from '@/lib/authedFetch';
import {
  HAS_SIGNED_IN_KEY,
  DEFAULT_WORK_DAYS,
  type Meeting,
  type SortMode,
  type Subtask,
  type Task,
} from '@/lib/taskTypes';
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

export default function Home() {
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
  const [homeCoords, setHomeCoords] = useState<Coords | null>(null);
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
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  const { rowElsRef, handleDragHandlePointerDown, handleDragHandlePointerMove, handleDragHandlePointerUp, dragRowStyle } =
    useDragReorder(setTasks);

  // ── The "brain": completed-task history feeds fuzzy clustering, which
  // powers both the capture-time suggestion chip and the capacity math's
  // effective (learned) estimates below. Location suggestions ride the
  // same clusters now — see suggestLocation in taskIntelligence.ts.
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);

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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session) loadEverything();
  }, [session]);

  async function loadEverything() {
    const userId = session.user.id;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('work_start, work_end, work_days, timezone, sort_mode, onboarded, home_lat, home_lng, work_lat, work_lng')
      .eq('user_id', userId)
      .maybeSingle();

    const detectedTimezone =
      typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

    if (settings) {
      setWorkStart(settings.work_start || '08:00');
      setWorkEnd(settings.work_end || '16:00');
      setWorkDays(settings.work_days && settings.work_days.length > 0 ? settings.work_days : DEFAULT_WORK_DAYS);
      setSortMode((settings.sort_mode as SortMode) || 'capacity_first');
      if (settings.home_lat != null && settings.home_lng != null) {
        setHomeCoords({ lat: settings.home_lat, lng: settings.home_lng });
      }
      if (settings.work_lat != null && settings.work_lng != null) {
        setWorkCoords({ lat: settings.work_lat, lng: settings.work_lng });
      }
      if (!settings.timezone && detectedTimezone) {
        supabase.from('user_settings').update({ timezone: detectedTimezone }).eq('user_id', userId);
      }
      // onboarded defaults false on the column; only explicit false shows
      // the welcome screen — anything truthy (including rows from before
      // this column existed, which were backfilled to true) skips it.
      if (settings.onboarded === false) {
        setShowOnboarding(true);
      }
    } else {
      const { error: settingsError } = await supabase.from('user_settings').insert({
        user_id: userId,
        work_start: '08:00',
        work_end: '16:00',
        work_days: DEFAULT_WORK_DAYS,
        timezone: detectedTimezone,
        sort_mode: 'capacity_first',
        onboarded: false,
      });
      if (settingsError) {
        console.error(settingsError);
        alert('Could not set up your account: ' + settingsError.message);
      }
      setShowOnboarding(true);
    }

    const { data: taskRows } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'done')
      .order('order_index', { ascending: true });
    setTasks(taskRows || []);

    const { data: meetingRows } = await supabase.from('meetings').select('*');
    setMeetings(meetingRows || []);

    if (taskRows && taskRows.length > 0) {
      const ids = taskRows.map((t: Task) => t.id);
      const { data: subRows } = await supabase.from('subtasks').select('*').in('task_id', ids).order('order_index', { ascending: true });
      const grouped: Record<string, Subtask[]> = {};
      (subRows || []).forEach((s: Subtask) => {
        if (!grouped[s.task_id]) grouped[s.task_id] = [];
        grouped[s.task_id].push(s);
      });
      setSubtasksByTask(grouped);
    }

    // Completed-task history for the learning layer — capped at the most
    // recent 500 so clustering stays cheap even after months of use.
    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng')
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500);
    setHistory(
      (historyRows || []).map((r: any) => ({
        text: r.text,
        actual_mins: r.actual_mins,
        location_text: r.location_text,
        lat: r.lat,
        lng: r.lng,
      }))
    );
  }

  function toggleWorkDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  async function completeOnboarding() {
    if (!session) return;
    setOnboardSaving(true);
    const { error } = await supabase
      .from('user_settings')
      .update({ work_start: workStart, work_end: workEnd, work_days: workDays, onboarded: true })
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
    // Explicit shouldCreateUser: false as a second layer on top of the
    // "Allow new users to sign up" toggle in the Supabase dashboard — if
    // that setting ever gets flipped back on by accident, magic-link
    // sign-in still won't silently create new accounts.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      setSignInError("Could not send a sign-in link. If you're not on the invite list yet, reach out and we'll get you set up.");
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

    const orderedIds = nearestNeighborOrder(base.coords, located);
    setRecalculatingRoute(true);
    setRouteError(null);

    // Ask the browser for a GPS fix up front so the first/last legs start
    // from where the user actually is. Falls back to the Home/Work base
    // (resolved server-side from baseLabel) when unavailable/denied.
    const gps = await getGpsPosition();
    if (sortMode !== 'geo_aware' || !session) return; // mode changed while waiting
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

    try {
      const json = await authedFetch('/api/today/calculate-route', {
        orderedTaskIds: orderedIds,
        baseLabel: base.label,
        nowLocalMins,
        remainingTaskMins,
        ...(gps ? { origin: { lat: gps.lat, lng: gps.lng } } : {}),
      });
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
        const { data: taskRows } = await supabase
          .from('tasks')
          .select('*')
          .neq('status', 'done')
          .order('order_index', { ascending: true });
        setTasks(taskRows || []);
      }
    } catch {
      setRouteError('Could not reach the server — check your connection and try again.');
    } finally {
      setRecalculatingRoute(false);
    }
  }

  // Auto-recalculates whenever geo_aware becomes the active sort mode,
  // and zeroes route numbers out the moment it stops being active — so
  // switching away never leaves stale drive-time inflating capacity math
  // in a mode where the order no longer justifies it.
  useEffect(() => {
    if (sortMode === 'geo_aware' && session) {
      recalcRoute();
    } else {
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setGpsCoords(null);
      setReturnLabel(null);
      setRouteError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, session]);

  async function addTask() {
    const text = taskText.trim();
    if (text.length === 0) return;
    const mins = parseMins(taskTime);
    if (mins === null) {
      setError('Could not read that time, try 15m or 1.5h');
      return;
    }
    setError('');
    const userId = session.user.id;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    const surfaceDate = showReminderField && captureSurfaceDate.length > 0 ? captureSurfaceDate : null;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        text,
        estimate_mins: mins,
        source: 'came_up',
        order_index: maxOrder + 1,
        surface_date: surfaceDate,
        location_text: captureLocation.trim().length > 0 ? captureLocation.trim() : null,
        lat: captureLocationCoords?.lat ?? null,
        lng: captureLocationCoords?.lng ?? null,
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
    setCaptureOpen(false);
    if (data.lat != null && sortMode === 'geo_aware') recalcRoute();
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
    if (t.estimate_mins <= 0) {
      return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
    }
    const suggestion = suggestEstimate(t.text, history, clusters);
    const effEstimate = effectiveEstimate(t.estimate_mins, suggestion);
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
      <TravelAwarenessBanner />

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
      />

      <div className="task-list">
        {ordered.length === 0 && (
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
          error={error}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {!captureOpen && (
        <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Dock it">+</button>
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
    </div>
  );
}
