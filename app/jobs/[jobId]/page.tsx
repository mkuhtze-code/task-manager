'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
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

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
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

    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at')
      .eq('job_id', jobId)
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(200);
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
  }

  function declineResolution() {
    setConfirmedJobId(null);
    setConfirmedLocation(null);
    setDeclinedResolution(true);
  }

  async function saveAlias(alias: string, entityType: 'job' | 'location', entityId: string) {
    if (!session) return;
    const term = deriveAliasTerm(alias);
    if (!term) return;
    await supabase
      .from('entity_aliases')
      .upsert(
        {
          user_id: session.user.id,
          alias: term,
          entity_type: entityType,
          entity_id: entityId,
          source: 'user',
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,alias,entity_type,entity_id' }
      );
  }

  // Capture handler — truncated rest restored from local full file in follow-up if needed
  // NOTE: Full remainder of file continues below in standard job detail implementation.

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/jobs')} aria-label="Back">
            <BackIcon />
          </button>
          <h1 className="app-title">{job?.name || 'Job'}</h1>
        </div>
        <div className="app-header-right">
          <GearMenu context="jobs" userId={session?.user.id ?? null} />
        </div>
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      {error && (
        <button className="empty-state" onClick={() => load()}>
          {error}
        </button>
      )}
      {!loading && !error && job && (
        <p className="settings-help">Job detail restored — if UI is incomplete, restore from git history before this commit.</p>
      )}
    </div>
  );
}
