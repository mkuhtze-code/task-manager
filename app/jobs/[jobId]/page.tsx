'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useDesktopWorkspaceKeys } from '@/hooks/useDesktopWorkspaceKeys';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting } from '@/lib/meetingTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import type { Job } from '@/lib/jobTypes';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtMins, localDateStr, parseMins, isScheduledForLater } from '@/lib/timeFormat';
import { doneTasksOf, groupJobTasks, isJobDone, jobProgress, jobNextTask, onTodayCount } from '@/lib/jobUtils';
import GearMenu from '@/components/GearMenu';
import { TaskCard } from '@/components/TaskCard';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import { JobEditSheet } from '@/components/JobSheets';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, CheckIcon, ChevronIcon, MapPinIcon } from '@/components/icons';
import JobFilesPanel from '@/components/JobFilesPanel';
import JobObservationsPanel from '@/components/JobObservationsPanel';
import JobSwitcher from '@/components/JobSwitcher';
import PillReveal from '@/components/PillReveal';
import {
  buildClusters,
  suggestEstimate,
  suggestLocation,
  suggestsLocation,
  suggestJob,
  suggestLocationMemory,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import { decidePersonalGravity } from '@/lib/thinking/decisions/personalGravity';
import type { SurfaceEvent } from '@/lib/thinking/types';
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import {
  resolveJobAndLocation,
  deriveAliasTerm,
  type JobLocationResolution,
  type JobLocationCandidate,
  type EntityAliasMemory,
  type EntityRelationshipMemory,
} from '@/lib/unifiedInput/resolve';

// The Job detail page is a LENS over the same Tasks Today shows.

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const { isDesktop } = useSurfaceMode();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobMeetings, setJobMeetings] = useState<Meeting[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  /** Mobile-only section focus: tasks | evidence | more */
  const [mobileTab, setMobileTab] = useState<'tasks' | 'evidence' | 'more'>('tasks');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureLocationCoords, setCaptureLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualLocationToggle, setManualLocationToggle] = useState(false);
  const [showReminderField, setShowReminderField] = useState(false);
  const [captureSurfaceDate, setCaptureSurfaceDate] = useState('');
  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState('');

  const [thought, setThought] = useState<ThoughtParts | null>(null);
  const [locationResolution, setLocationResolution] = useState<JobLocationResolution | null>(null);
  const [intendedTime, setIntendedTime] = useState('');
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<{ text: string; lat: number | null; lng: number | null } | null>(null);
  const [declinedResolution, setDeclinedResolution] = useState(false);
  const [entityAliases, setEntityAliases] = useState<EntityAliasMemory[]>([]);

  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
  const [surfaceEvents, setSurfaceEvents] = useState<SurfaceEvent[]>([]);
  const gravityDecision = useMemo(
    () => decidePersonalGravity(surfaceEvents),
    [surfaceEvents]
  );

  const activeEntityIds = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);

  const entityMemory = useMemo<EntityRelationshipMemory>(
    () => ({
      aliases: entityAliases.filter((a) => a.active),
      activeEntityIds,
    }),
    [entityAliases, activeEntityIds]
  );

  useEffect(() => {
    const raw = captureText.trim();
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
    const resolution = resolveJobAndLocation(parsed, jobs, entityMemory);
    setLocationResolution(resolution);
    setIntendedTime(parsed.time ? parsed.time.label : '');
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(false);
    if (resolution.state === 'known') {
      const c = resolution.candidate;
      setConfirmedJobId(c.jobId);
      setConfirmedLocation({
        text: c.matchedField === 'location' && c.locationText ? c.locationText : c.jobName,
        lat: c.lat,
        lng: c.lng,
      });
    }
    if (resolution.state === 'none' && parsed.locationHint && parsed.locationHint.length > 0) {
      setCaptureLocation((prev) => (prev.trim().length > 0 ? prev : parsed.locationHint!));
      setManualLocationToggle(true);
    }
  }, [captureText, jobs, entityMemory]);

  const captureSuggestion = useMemo(() => {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) return null;
    return suggestEstimate(trimmed, history, clusters);
  }, [captureText, history, clusters]);

  const captureLocationSuggestion = useMemo(() => {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocation(trimmed, history, clusters);
  }, [captureText, history, clusters]);

  const captureJobSuggestion = useMemo(() => {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) return null;
    return suggestJob(trimmed, history, clusters);
  }, [captureText, history, clusters]);

  const captureLocationMemorySuggestion = useMemo(() => {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocationMemory(trimmed, history, clusters);
  }, [captureText, history, clusters]);

  const captureContext = useMemo(() => {
    const trimmed = captureText.trim();
    return decideCaptureContext({
      surface: 'jobs',
      currentJobId: jobId,
      taskText: trimmed,
      jobDecision: captureJobSuggestion,
      locationDecision: captureLocationMemorySuggestion,
      gravityDecision,
    });
  }, [captureText, jobId, captureJobSuggestion, captureLocationMemorySuggestion, gravityDecision]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session]);

  async function load() {
    setLoading(true);
    setError(null);
    const userId = session.user.id;

    const { data: jobRow, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .maybeSingle();
    if (jobErr || !jobRow) {
      console.error(jobErr);
      setError("This job couldn't load — tap to retry");
      setLoading(false);
      return;
    }
    setJob(jobRow as Job);

    const { data: jobRows, error: jobsErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .neq('id', jobId)
      .order('created_at', { ascending: false });
    if (jobsErr) {
      console.error(jobsErr);
      setError("This job couldn't load — tap to retry");
      setLoading(false);
      return;
    }
    setJobs([jobRow as Job, ...((jobRows as Job[]) || [])]);

    const { data: taskRows, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('job_id', jobId)
      .order('order_index', { ascending: true });
    if (taskErr) {
      console.error(taskErr);
      setError("This job couldn't load — tap to retry");
      setLoading(false);
      return;
    }
    const taskList = (taskRows as Task[]) || [];
    setTasks(taskList);

    const { data: meetingRows } = await supabase
      .from('meetings')
      .select('*')
      .eq('job_id', jobId)
      .order('start_time', { ascending: false })
      .limit(30);
    setJobMeetings((meetingRows as Meeting[]) || []);

    if (taskList.length > 0) {
      const ids = taskList.map((t) => t.id);
      const { data: subRows } = await supabase.from('subtasks').select('*').in('task_id', ids).order('order_index', { ascending: true });
      const grouped: Record<string, Subtask[]> = {};
      (subRows || []).forEach((s: Subtask) => {
        if (!grouped[s.task_id]) grouped[s.task_id] = [];
        grouped[s.task_id].push(s);
      });
      setSubtasksByTask(grouped);
    }

    // User-wide history so job remaining mins share the same runtime
    // observations as Today and the Jobs overview (not only this job's tasks).
    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at')
      .eq('user_id', userId)
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
        job_id: r.job_id,
        created_at: r.created_at,
        completed_at: r.completed_at,
      }))
    );

    const { data: eventRows } = await supabase
      .from('surface_events')
      .select('id, user_id, surface, active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (eventRows) setSurfaceEvents(eventRows as SurfaceEvent[]);

    const { data: aliasRows } = await supabase
      .from('entity_aliases')
      .select('id, user_id, alias, entity_type, entity_id, source, active, created_at, updated_at');
    if (aliasRows) {
      setEntityAliases(
        (aliasRows as any[])
          .filter((r) => r.active !== false)
          .map((r) => ({
            alias: r.alias,
            entityType: r.entity_type,
            entityId: r.entity_id,
            active: r.active !== false,
          }))
      );
    }

    setLoading(false);
  }

  async function saveJob(name: string, client: string, locationText: string, lat: number | null, lng: number | null) {
    setSaving(true);
    const { error: err } = await supabase
      .from('jobs')
      .update({ name, client: client || null, location_text: locationText || null, lat, lng })
      .eq('id', jobId);
    setSaving(false);
    if (err) {
      console.error(err);
      return;
    }
    setJob((prev) => (prev ? { ...prev, name, client, location_text: locationText, lat, lng } : prev));
    setEditOpen(false);
  }

  async function deleteJob() {
    await supabase.from('tasks').update({ job_id: null }).eq('job_id', jobId);
    const { error: err } = await supabase.from('jobs').delete().eq('id', jobId);
    if (err) {
      console.error(err);
      return;
    }
    router.replace('/jobs');
  }

  function openCapture() {
    setCaptureJobId(jobId);
    setCaptureError('');
    setThought(null);
    setLocationResolution(null);
    setIntendedTime('');
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(false);
    setCaptureText('');
    setCaptureTime('');
    if (job?.location_text) {
      setCaptureLocation(job.location_text);
      if (job.lat != null && job.lng != null) {
        setCaptureLocationCoords({ lat: job.lat, lng: job.lng });
      }
      setManualLocationToggle(true);
    } else {
      setCaptureLocation('');
      setCaptureLocationCoords(null);
      setManualLocationToggle(false);
    }
    setCaptureOpen(true);
  }

  async function surfaceOnToday(id: string) {
    const today = localDateStr(new Date());
    const { error } = await supabase
      .from('tasks')
      .update({ surface_date: today, due_today: true })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not update the task: ' + error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, surface_date: today, due_today: true } : t))
    );
  }

  async function updateTask(id: string, text: string, mins: number, surfaceDate: string | null, locationText: string | null, lat: number | null, lng: number | null) {
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
  }

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
    // Prefer timer-observed time; fall back to estimate so zero-timer
    // completes still feed the learning loop when the user had an estimate.
    const actual = Math.round(finalLogged) > 0
      ? Math.round(finalLogged)
      : Math.round(task?.estimate_mins || 0);
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'done',
        started_at: null,
        logged_mins: finalLogged,
        actual_mins: actual > 0 ? actual : Math.round(finalLogged),
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not complete the task: ' + error.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'done', started_at: null, logged_mins: finalLogged, actual_mins: actual > 0 ? actual : Math.round(finalLogged) }
          : t
      )
    );
    if (task) {
      if (actual > 0) {
        setHistory((prev) => [
          {
            text: task.text,
            actual_mins: actual,
            location_text: task.location_text,
            lat: task.lat,
            lng: task.lng,
          },
          ...prev,
        ]);
      }
      closeCompletionLoop({
        userId: session?.user?.id,
        taskText: task.text,
        estimateMins: task.estimate_mins,
        actualMins: actual,
        history,
        clusters,
      });
    }
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not delete the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
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

  async function moveTaskToJob(id: string, targetJobId: string | null) {
    if (targetJobId === jobId) return;
    const { error } = await supabase.from('tasks').update({ job_id: targetJobId }).eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not move the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
  }

  function confirmResolution(c: JobLocationCandidate) {
    setConfirmedJobId(c.jobId);
    setConfirmedLocation({
      text: c.matchedField === 'location' && c.locationText ? c.locationText : c.jobName,
      lat: c.lat,
      lng: c.lng,
    });
    setDeclinedResolution(false);
    if (thought) {
      const alias = deriveAliasTerm(thought, c);
      persistEntityAlias(alias, c.jobId).catch(() => {});
    }
  }

  function declineResolution() {
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(true);
  }

  async function persistEntityAlias(alias: string, targetJobId: string) {
    if (!session) return;
    const normalized = alias.trim().toLowerCase();
    if (normalized.length === 0) return;
    const upsert = await supabase
      .from('entity_aliases')
      .upsert(
        {
          user_id: session.user.id,
          alias: normalized,
          entity_type: 'job',
          entity_id: targetJobId,
          source: 'user_confirmed',
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,alias,entity_type,entity_id' }
      )
      .select('*')
      .single();
    if (upsert.error) {
      console.error('Could not persist entity relationship:', upsert.error.message);
      return;
    }
    setEntityAliases((prev) => {
      const next = prev.filter((a) => !(a.alias === normalized && a.entityId === targetJobId));
      return [...next, { alias: normalized, entityType: 'job', entityId: targetJobId, active: true }];
    });
  }

  async function addTask() {
    const originalInput = captureText.trim();
    if (originalInput.length === 0) {
      setCaptureError('Give the task a name');
      return;
    }
    const parsed = thought;
    const text =
      parsed && parsed.hadFacets && parsed.intent && parsed.intent.length > 0
        ? parsed.intent
        : originalInput;
    const mins = parseMins(captureTime || '0m');
    if (mins === null) {
      setCaptureError("Couldn't read that time — try 15m or 1.5h");
      return;
    }
    setCaptureError('');
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    const surfaceDate =
      showReminderField && captureSurfaceDate.length > 0
        ? captureSurfaceDate
        : (parsed?.date ?? null);
    const intended =
      intendedTime && intendedTime.length > 0
        ? intendedTime
        : (parsed?.time ? parsed.time.label : null);
    const dockJobId = confirmedJobId ?? captureJobId ?? jobId;
    const locationText =
      confirmedLocation && confirmedLocation.text.length > 0
        ? confirmedLocation.text
        : (captureLocation.trim().length > 0
            ? captureLocation.trim()
            : (parsed?.locationHint && parsed.locationHint.length > 0
                ? parsed.locationHint
                : (job?.location_text ?? null)));
    const lat =
      confirmedLocation?.lat != null
        ? confirmedLocation.lat
        : (captureLocationCoords?.lat ?? job?.lat ?? null);
    const lng =
      confirmedLocation?.lng != null
        ? confirmedLocation.lng
        : (captureLocationCoords?.lng ?? job?.lng ?? null);

    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        user_id: session.user.id,
        text,
        estimate_mins: mins,
        source: 'planned',
        order_index: maxOrder + 1,
        job_id: dockJobId,
        surface_date: surfaceDate,
        intended_time: intended,
        location_text: locationText,
        lat,
        lng,
        original_input: originalInput,
      })
      .select()
      .single();
    if (err) {
      console.error(err);
      setCaptureError("Couldn't add the task");
      return;
    }
    if (data.job_id === jobId) {
      setTasks((prev) => [...prev, data as Task]);
    }
    setCaptureOpen(false);
    setCaptureText('');
    setCaptureTime('');
    setCaptureLocation('');
    setCaptureLocationCoords(null);
    setManualLocationToggle(false);
    setShowReminderField(false);
    setCaptureSurfaceDate('');
    setCaptureJobId(null);
    setCaptureError('');
    setThought(null);
    setLocationResolution(null);
    setIntendedTime('');
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(false);
  }

  function completedSubtaskMins(taskId: string): number {
    return (subtasksByTask[taskId] || []).filter((s) => s.done).reduce((sum, s) => sum + s.mins, 0);
  }

  function remainingForTask(t: Task): number {
    let logged = t.logged_mins;
    if (t.status === 'active' && t.started_at) {
      logged += (Date.now() - new Date(t.started_at).getTime()) / 60000;
    }
    return Math.max(t.estimate_mins - logged - completedSubtaskMins(t.id), 0);
  }

  const todayStr = localDateStr(new Date());
  const progress = jobProgress(tasks, history, clusters);
  const nextTask = jobNextTask(tasks, todayStr);
  const todayCount = onTodayCount(tasks, todayStr);
  const nextNeedsToday = nextTask != null && isScheduledForLater(nextTask, todayStr);
  const done = isJobDone(tasks);
  const groups = useMemo(() => groupJobTasks(tasks, todayStr), [tasks, todayStr]);
  const doneTasks = useMemo(() => doneTasksOf(tasks), [tasks]);
  const openTask = tasks.find((t) => t.id === openTaskId) || null;
  const anyActive = tasks.some((x) => x.status === 'active' && x.estimate_mins > 0);

  let openTaskRemaining = 0;
  let openTaskLiveLogged = 0;
  if (openTask) {
    openTaskRemaining = remainingForTask(openTask);
    openTaskLiveLogged = openTask.logged_mins;
    if (openTask.status === 'active' && openTask.started_at) {
      openTaskLiveLogged += (Date.now() - new Date(openTask.started_at).getTime()) / 60000;
    }
  }

  const captureLocationFieldVisible =
    suggestsLocation(captureText) || captureLocation.length > 0 || manualLocationToggle;

  const orderedTaskIds = tasks.filter((x) => x.status !== 'done').map((x) => x.id);
  useDesktopWorkspaceKeys({
    enabled: isDesktop,
    openId: openTaskId,
    setOpenId: setOpenTaskId,
    orderedIds: orderedTaskIds,
  });

  useEffect(() => {
    if (!isDesktop) return;
    return registerDesktopPrimaryAction('Add task', () => openCapture());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, jobId]);

  return (
    <div className={`app-shell${isDesktop && openTask ? ' has-desk-detail' : ''}${isDesktop ? ' desk-job-detail' : ''}`}>
      <div className="app-header">
        <div className="app-header-left" style={{ minWidth: 0, flex: 1 }}>
          <Link href="/jobs" className="back-link" aria-label="Back to jobs">
            <BackIcon />
          </Link>
          {job && !isDesktop ? (
            <JobSwitcher current={job} jobs={jobs.length ? jobs : [job]} />
          ) : (
            <h1 className="app-title">{job ? job.name : 'Job'}</h1>
          )}
        </div>
        <div className="app-header-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDesktop && job && (
            <PillReveal label="Meetings" count={jobMeetings.length} align="end">
              <div className="job-meetings-popover">
                {jobMeetings.length === 0 ? (
                  <p className="job-meetings-popover-empty">No meetings linked to this job yet.</p>
                ) : (
                  jobMeetings.map((m) => {
                    const past =
                      m.start_time != null && new Date(m.start_time).getTime() < Date.now();
                    return (
                      <Link
                        key={m.id}
                        href={`/meetings/${m.id}`}
                        className="task-conn-node task-conn-node-meeting"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="task-conn-kind">{past ? 'Past' : 'Meeting'}</span>
                        <span className="task-conn-title">{m.text}</span>
                        <span className="task-conn-meta mono">
                          {fmtMeetingWindow(m.start_time, m.duration_mins)}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </PillReveal>
          )}
          <GearMenu context="jobs" userId={session?.user.id ?? null} />
        </div>
      </div>

      {error && (
        <button className="recalc-error" onClick={load} disabled={loading}>
          {error}
        </button>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : job ? (
        <>
          <button className="job-head" onClick={() => setEditOpen(true)} aria-expanded={editOpen}>
            <span className="job-head-left">
              {job.client && <span className="job-head-context">{job.client}</span>}
              {job.location_text && (
                <span className="job-head-location">
                  <MapPinIcon size={12} />
                  <span className="activity-meta-loc-text">{job.location_text}</span>
                </span>
              )}
            </span>
            <span className="job-head-right">
              {tasks.length > 0 && (
                <span className={done ? 'job-head-progress done' : 'job-head-progress'}>
                  {done
                    ? `Complete · ${progress.done} of ${progress.total}`
                    : `${progress.done} of ${progress.total} · ${fmtMins(progress.remainingMins)} left`}
                </span>
              )}
              <span className="job-head-chev"><ChevronIcon size={16} /></span>
            </span>
          </button>

          {!done && tasks.length > 0 && (
            <div style={{ padding: '0 var(--space-page, 16px) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="settings-help" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                {todayCount > 0 && (
                  <span>{todayCount === 1 ? '1 on Today' : `${todayCount} on Today`}</span>
                )}
                {nextTask && !nextNeedsToday && (
                  <span>Next: {nextTask.text.length > 40 ? nextTask.text.slice(0, 39) + '…' : nextTask.text}</span>
                )}
              </div>
              {nextNeedsToday && nextTask && (
                <button type="button" className="btn-text" style={{ padding: 0, alignSelf: 'flex-start' }} onClick={() => surfaceOnToday(nextTask.id)}>
                  Put “{nextTask.text.length > 28 ? nextTask.text.slice(0, 27) + '…' : nextTask.text}” on today
                </button>
              )}
            </div>
          )}
{!isDesktop && (
            <div className="job-mobile-tabs" role="tablist" aria-label="Job sections">
              <button
                type="button"
                role="tab"
                className={mobileTab === 'tasks' ? 'job-mobile-tab is-active' : 'job-mobile-tab'}
                aria-selected={mobileTab === 'tasks'}
                onClick={() => setMobileTab('tasks')}
              >
                Tasks
                {tasks.filter((x) => x.status !== 'done').length > 0 && (
                  <span className="tab-count">{tasks.filter((x) => x.status !== 'done').length}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                className={mobileTab === 'evidence' ? 'job-mobile-tab is-active' : 'job-mobile-tab'}
                aria-selected={mobileTab === 'evidence'}
                onClick={() => setMobileTab('evidence')}
              >
                Evidence
              </button>
              <button
                type="button"
                role="tab"
                className={mobileTab === 'more' ? 'job-mobile-tab is-active' : 'job-mobile-tab'}
                aria-selected={mobileTab === 'more'}
                onClick={() => setMobileTab('more')}
              >
                More
                {jobMeetings.length > 0 && (
                  <span className="tab-count">{jobMeetings.length}</span>
                )}
              </button>
            </div>
          )}

          {(isDesktop || mobileTab === 'tasks') && (tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">Nothing here yet.</div>
              <div className="empty-state-sub">Add a task to start the job — it will show up on Today when it is due.</div>
              <button className="btn btn-steel" onClick={openCapture}>Add a task</button>
            </div>
          ) : (
            <div className="task-list">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="job-group-label">{group.label}</div>
                  {group.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      remainingForThis={remainingForTask(t)}
                      liveLogged={
                        t.status === 'active' && t.started_at
                          ? t.logged_mins + (Date.now() - new Date(t.started_at).getTime()) / 60000
                          : t.logged_mins
                      }
                      overCap={false}
                      anyActive={anyActive}
                      subs={subtasksByTask[t.id] || []}
                      learnedHint={null}
                      jobLabel={null}
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
                    />
                  ))}
                </div>
              ))}
              {doneTasks.length > 0 && (
                <div>
                  <button type="button" className="job-group-label" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }} onClick={() => setDoneOpen((v) => !v)}>
                    Done · {doneTasks.length}
                  </button>
                  {doneOpen && doneTasks.map((t) => (
                    <div key={t.id} className="job-row completed" style={{ opacity: 0.7 }}>
                      <div className="job-row-top">
                        <span className="job-row-name">{t.text}</span>
                        <span className="job-row-done-mark" aria-label="Complete"><CheckIcon done /></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {editOpen && (
            <JobEditSheet job={job} saving={saving} onClose={() => setEditOpen(false)} onSave={saveJob} onDelete={deleteJob} />
          )}


          {(isDesktop || mobileTab === 'evidence') && (
            <div
              className="job-library"
              style={{
                marginTop: isDesktop ? 8 : 4,
                paddingTop: isDesktop ? 8 : 4,
                borderTop: isDesktop ? '1px solid var(--line)' : 'none',
              }}
            >
              {session?.user?.id && (
                <>
                  <JobObservationsPanel
                    jobId={jobId}
                    userId={session.user.id}
                    defaultCollapsed={false}
                  />
                  <JobFilesPanel
                    jobId={jobId}
                    userId={session.user.id}
                    variant="job"
                    defaultCollapsed={false}
                  />
                </>
              )}
            </div>
          )}

          {(isDesktop || mobileTab === 'more') && (
            <div className="job-more" style={{ marginTop: 4 }}>
              {jobMeetings.length > 0 ? (
                <section className="job-meetings-section" style={{ marginBottom: 12 }}>
                  <div className="job-group-label">Meetings · {jobMeetings.length}</div>
                  <div className="task-list" style={{ gap: 6 }}>
                    {jobMeetings.map((m) => {
                      const past =
                        m.start_time != null && new Date(m.start_time).getTime() < Date.now();
                      return (
                        <Link
                          key={m.id}
                          href={`/meetings/${m.id}`}
                          className="task-conn-node task-conn-node-meeting"
                          style={{ textDecoration: 'none' }}
                        >
                          <span className="task-conn-kind">{past ? 'Past' : 'Meeting'}</span>
                          <span className="task-conn-title">{m.text}</span>
                          <span className="task-conn-meta mono">
                            {fmtMeetingWindow(m.start_time, m.duration_mins)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : (
                !isDesktop && (
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 0' }}>
                    No meetings linked to this job yet.
                  </p>
                )
              )}
              {!isDesktop && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', marginBottom: 12 }}
                  onClick={() => setEditOpen(true)}
                >
                  Edit job details
                </button>
              )}
            </div>
          )}

          {openTask && (
            <TaskDetailSheet
              presentation={isDesktop ? 'pane' : 'sheet'}
              task={openTask}
              subs={subtasksByTask[openTask.id] || []}
              remainingForThis={openTaskRemaining}
              liveLogged={openTaskLiveLogged}
              anyActive={anyActive}
              context="job"
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

          {captureOpen && (
            <CaptureSheet
              taskText={captureText}
              setTaskText={setCaptureText}
              taskTime={captureTime}
              setTaskTime={setCaptureTime}
              captureSuggestion={captureSuggestion}
              captureLocationSuggestion={captureLocationSuggestion}
              captureLocationMemorySuggestion={captureLocationMemorySuggestion}
              captureJobSuggestion={captureJobSuggestion}
              captureContext={captureContext}
              locationFieldVisible={captureLocationFieldVisible}
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
              error={captureError}
              onClose={() => setCaptureOpen(false)}
            />
          )}
        </>
      ) : null}

      <SurfaceNav
        active="jobs"
        onAdd={job && !captureOpen ? () => openCapture() : undefined}
        addLabel="Add a task"
      />
    </div>
  );
}
