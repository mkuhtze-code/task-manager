'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Job } from '@/lib/jobTypes';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtMins, localDateStr, parseMins } from '@/lib/timeFormat';
import { doneTasksOf, groupJobTasks, isJobDone, jobProgress } from '@/lib/jobUtils';
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
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import { decidePersonalGravity } from '@/lib/thinking/decisions/personalGravity';
import type { SurfaceEvent } from '@/lib/thinking/types';

// The Job detail page is a LENS over the same Tasks Today shows — it never
// renders its own task UI. Open Tasks are the exact TaskCard component with
// the exact TaskDetailSheet behind them; the only Job-specific behaviour is
// grouping by surface_date, and assigning/moving job_id. Completed Tasks
// stay visible as a quiet collapsed record, the same way Today lets
// finished work fade rather than vanish.

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
  const [doneOpen, setDoneOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});

  // Capture state — the shared CaptureSheet, pre-bound to this Job.
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

  // ── Intelligence layer (Scope 3H) ───────────────────────────────
  // Completed-task history for this job feeds the learning layer.
  // Also loads global surface events for Personal Gravity, which
  // provides supporting context for capture decisions.
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
  const [surfaceEvents, setSurfaceEvents] = useState<SurfaceEvent[]>([]);
  const gravityDecision = useMemo(
    () => decidePersonalGravity(surfaceEvents),
    [surfaceEvents]
  );

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
    // The full job list (current job included) powers the shared Task
    // detail sheet's assign/move picker.
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

    // Completed-task history for this job — powers the learning layer's
    // estimate and location suggestions within this job context.
    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at')
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
      }))
    );

    // Surface events for Personal Gravity — supporting context.
    const { data: eventRows } = await supabase
      .from('surface_events')
      .select('id, user_id, surface, active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (eventRows) setSurfaceEvents(eventRows as SurfaceEvent[]);

    setLoading(false);
  }

  // ── Job write paths ───────────────────────────────────────────────
  async function saveJob(name: string, client: string, locationText: string, lat: number | null, lng: number | null) {
    const { error: err } = await supabase
      .from('jobs')
      .update({ name, client: client || null, location_text: locationText || null, lat, lng })
      .eq('id', jobId);
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

  // ── Task write paths — identical semantics to Today's. The only diff
  // is that a completed Task stays in local state so it can move into the
  // collapsed Done group, and a moved/removed Task leaves this job's lens.
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
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', started_at: null, logged_mins: finalLogged, actual_mins: Math.round(finalLogged), completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error(error);
      alert('Could not complete the task: ' + error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done', started_at: null, logged_mins: finalLogged } : t)));
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

  // Moving a Task out of this Job (to another, or to no job) is the same
  // job_id write the shared sheet performs everywhere — this lens simply
  // drops the Task from its list once it no longer belongs.
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

  async function addTask() {
    const text = captureText.trim();
    if (text.length === 0) {
      setCaptureError('Give the task a name');
      return;
    }
    const mins = parseMins(captureTime || '0m');
    if (mins === null) {
      setCaptureError("Couldn't read that time — try 15m or 1.5h");
      return;
    }
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order_index), 0);
    const surfaceDate = showReminderField && captureSurfaceDate.length > 0 ? captureSurfaceDate : null;
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        user_id: session.user.id,
        text,
        estimate_mins: mins,
        source: 'planned',
        order_index: maxOrder + 1,
        job_id: captureJobId,
        surface_date: surfaceDate,
        location_text: captureLocation.trim().length > 0 ? captureLocation.trim() : null,
        lat: captureLocationCoords?.lat ?? null,
        lng: captureLocationCoords?.lng ?? null,
      })
      .select()
      .single();
    if (err) {
      console.error(err);
      setCaptureError("Couldn't add the task");
      return;
    }
    setTasks((prev) => [...prev, data as Task]);
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
  const progress = jobProgress(tasks);
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

  const captureLocationFieldVisible = suggestsLocation(captureText) || captureLocation.length > 0 || manualLocationToggle;

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <Link href="/jobs" className="back-link" aria-label="Back to jobs">
            <BackIcon />
          </Link>
          <h1 className="app-title">{job ? job.name : 'Job'}</h1>
        </div>
        <div className="app-header-right">
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

          {tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">Nothing here yet.</div>
              <div className="empty-state-sub">Add a task to start the job — it'll show up on Today when it's due.</div>
              <button
                className="btn btn-steel"
                onClick={() => { setCaptureJobId(jobId); setCaptureOpen(true); }}
              >
                Add a task
              </button>
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
                      expanded={expandedId === t.id}
                      onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
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
                <>
                  <button className="job-done-toggle" onClick={() => setDoneOpen((v) => !v)} aria-expanded={doneOpen}>
                    <span>Done · {doneTasks.length}</span>
                    <ChevronIcon size={16} />
                  </button>
                  {doneOpen && doneTasks.map((t) => (
                    <div key={t.id} className="task-row job-done-task">
                      <div className="task-main">
                        <span className="check-btn"><CheckIcon done /></span>
                        <span className="task-text">{t.text}</span>
                        <span className="activity-glance mono">{fmtMins(t.estimate_mins)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {editOpen && (
            <JobEditSheet
              job={job}
              saving={false}
              onClose={() => setEditOpen(false)}
              onSave={saveJob}
              onDelete={deleteJob}
            />
          )}

          {openTask && (
            <TaskDetailSheet
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
              thought={null}
              intendedTime=""
              locationResolution={null}
              declinedResolution={false}
              onConfirmResolution={() => {}}
              onDeclineResolution={() => {}}
              error={captureError}
              onClose={() => setCaptureOpen(false)}
            />
          )}

          </>
      ) : null}

      <SurfaceNav
        active="jobs"
        onAdd={job && !captureOpen && tasks.length > 0 ? () => { setCaptureJobId(jobId); setCaptureOpen(true); } : undefined}
        addLabel="Add a task"
      />
    </div>
  );
}
