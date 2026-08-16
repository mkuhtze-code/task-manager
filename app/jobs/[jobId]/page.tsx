'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';
import { fmtMins, fmtSurfaceDate, localDateStr, parseMins } from '@/lib/timeFormat';
import { doneTasksOf, groupJobTasks, isJobDone, jobProgress } from '@/lib/jobUtils';
import GearMenu from '@/components/GearMenu';
import TopSwitcher from '@/components/TopSwitcher';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { TaskInfo } from '@/components/TaskInfo';
import { JobEditSheet } from '@/components/JobSheets';
import {
  BackIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  FitCheckIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';

// ── The sheet that opens when you tap a Task inside a Job ─────────────
// Name, estimate and surface date are editable; Complete, Move to another
// Job, Remove from Job and Delete are the actions. Today keeps scheduling
// these Tasks entirely on its own — this sheet never touches that.

function JobTaskSheet(props: {
  task: Task;
  jobName: string;
  otherJobs: Job[];
  onClose: () => void;
  onComplete: (id: string) => Promise<void>;
  onMove: (id: string, jobId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, data: { text: string; estimate_mins: number; surface_date: string | null; info?: string }) => Promise<void>;
}) {
  const { task, jobName, otherJobs, onClose, onComplete, onMove, onDelete, onSave } = props;

  const [text, setText] = useState(task.text);
  const [timeStr, setTimeStr] = useState(fmtMins(task.estimate_mins));
  const [surfaceDate, setSurfaceDate] = useState(task.surface_date || '');
  const [showDateField, setShowDateField] = useState(!!task.surface_date);
  const [moveOpen, setMoveOpen] = useState(false);
  const [error, setError] = useState('');

  async function commit() {
    const mins = parseMins(timeStr);
    if (mins === null) {
      setError("Couldn't read that time — try 15m or 1.5h");
      return;
    }
    setError('');
    await onSave(task.id, {
      text: text.trim(),
      estimate_mins: mins,
      surface_date: showDateField && surfaceDate ? surfaceDate : null,
    });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">Task</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {jobName && <p className="settings-help" style={{ marginBottom: 8 }}>In <strong>{jobName}</strong></p>}

        <input
          type="text"
          className="task-detail-name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Estimate</span>
          <input
            type="text"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            onBlur={commit}
          />
        </div>

        {!showDateField ? (
          <button
            type="button"
            className="reveal-reminder-link"
            onClick={() => setShowDateField(true)}
          >
            For another day
          </button>
        ) : (
          <div className="reminder-date-row">
            <input
              type="date"
              value={surfaceDate}
              onChange={(e) => { setSurfaceDate(e.target.value); onSave(task.id, { text: text.trim(), estimate_mins: task.estimate_mins, surface_date: e.target.value || null }); }}
            />
            <button
              type="button"
              className="btn-text"
              onClick={() => { setShowDateField(false); setSurfaceDate(''); onSave(task.id, { text: text.trim(), estimate_mins: task.estimate_mins, surface_date: null }); }}
            >
              Cancel
            </button>
          </div>
        )}

        <TaskInfo value={task.info} surface="edit" onSave={(info) => onSave(task.id, { text: text.trim(), estimate_mins: task.estimate_mins, surface_date: task.surface_date, info })} />

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        <button
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => { onComplete(task.id); onClose(); }}
        >
          <FitCheckIcon /> Complete
        </button>

        <button className="detail-reveal" onClick={() => setMoveOpen((v) => !v)} aria-expanded={moveOpen}>
          <span>Move to another job</span>
          <ChevronIcon size={14} />
        </button>
        {moveOpen && (
          <div className="move-day-list">
            <button
              className="move-day-option"
              onClick={() => { onMove(task.id, null); onClose(); }}
            >
              No job
            </button>
            {otherJobs.map((j) => (
              <button key={j.id} className="move-day-option" onClick={() => { onMove(task.id, j.id); onClose(); }}>
                {j.name}
              </button>
            ))}
          </div>
        )}

        <div className="detail-delete">
          <button
            className="btn-text"
            style={{ color: 'var(--danger-text, var(--danger))', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
            onClick={() => { onDelete(task.id); onClose(); }}
          >
            <TrashIcon /> Delete task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job detail ────────────────────────────────────────────────────────
export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [otherJobs, setOtherJobs] = useState<Job[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureCoords, setCaptureCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [captureDate, setCaptureDate] = useState('');
  const [showCaptureDate, setShowCaptureDate] = useState(false);
  const [captureError, setCaptureError] = useState('');

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
    setTasks((taskRows as Task[]) || []);

    const { data: other } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .neq('id', jobId)
      .order('created_at', { ascending: false });
    setOtherJobs((other as Job[]) || []);

    setLoading(false);
  }

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
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        user_id: session.user.id,
        text,
        estimate_mins: mins,
        source: 'planned',
        order_index: maxOrder + 1,
        job_id: jobId,
        surface_date: showCaptureDate && captureDate ? captureDate : null,
        location_text: captureLocation.trim() || null,
        lat: captureCoords?.lat ?? null,
        lng: captureCoords?.lng ?? null,
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
    setCaptureCoords(null);
    setCaptureDate('');
    setShowCaptureDate(false);
    setCaptureError('');
  }

  async function saveTask(id: string, data: { text: string; estimate_mins: number; surface_date: string | null; info?: string }) {
    const { error: err } = await supabase.from('tasks').update(data).eq('id', id);
    if (err) {
      console.error(err);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
  }

  async function completeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    let finalLogged = task ? task.logged_mins : 0;
    if (task && task.status === 'active' && task.started_at) {
      finalLogged += (Date.now() - new Date(task.started_at).getTime()) / 60000;
    }
    const { error: err } = await supabase
      .from('tasks')
      .update({ status: 'done', started_at: null, logged_mins: finalLogged, actual_mins: Math.round(finalLogged), completed_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      console.error(err);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done', started_at: null, logged_mins: finalLogged } : t)));
  }

  async function moveTask(id: string, targetJobId: string | null) {
    const { error: err } = await supabase.from('tasks').update({ job_id: targetJobId }).eq('id', id);
    if (err) {
      console.error(err);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
  }

  async function deleteTask(id: string) {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err) {
      console.error(err);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
  }

  const todayStr = localDateStr(new Date());
  const progress = jobProgress(tasks);
  const done = isJobDone(tasks);
  const groups = useMemo(() => groupJobTasks(tasks, todayStr), [tasks, todayStr]);
  const doneTasks = useMemo(() => doneTasksOf(tasks), [tasks]);
  const openTask = tasks.find((t) => t.id === openTaskId) || null;
  const remainingForTask = (t: Task) => Math.max(t.estimate_mins - t.logged_mins, 0);

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
          <TopSwitcher active="jobs" />
          <GearMenu context="jobs" />
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
              <button className="btn btn-steel" onClick={() => setCaptureOpen(true)}>Add a task</button>
            </div>
          ) : (
            <div className="task-list">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="job-group-label">{group.label}</div>
                  {group.tasks.map((t) => (
                    <div key={t.id} className="task-row">
                      <div className="task-main">
                        <button className="check-btn" onClick={() => completeTask(t.id)} aria-label="Complete task">
                          <CheckIcon done={false} />
                        </button>
                        <button className="task-text" onClick={() => setOpenTaskId(t.id)}>
                          {t.text}
                          {t.surface_date && t.surface_date < todayStr && (
                            <span className="task-due-today" style={{ marginLeft: 6 }}>{fmtSurfaceDate(t.surface_date)}</span>
                          )}
                        </button>
                        <span className="activity-glance mono">{fmtMins(remainingForTask(t))}</span>
                      </div>
                    </div>
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
            <JobTaskSheet
              task={openTask}
              jobName={job.name}
              otherJobs={otherJobs}
              onClose={() => setOpenTaskId(null)}
              onComplete={completeTask}
              onMove={moveTask}
              onDelete={deleteTask}
              onSave={saveTask}
            />
          )}

          {captureOpen && (
            <div className="sheet-backdrop" onClick={() => setCaptureOpen(false)}>
              <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="task-detail-header" style={{ marginBottom: 0 }}>
                  <div className="settings-panel-title">Add a task</div>
                  <button className="gear-btn" onClick={() => setCaptureOpen(false)} aria-label="Close">
                    <CloseIcon />
                  </button>
                </div>

                <input
                  type="text"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  placeholder="What needs doing?"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="settings-label">Estimate</span>
                  <input
                    type="text"
                    value={captureTime}
                    onChange={(e) => setCaptureTime(e.target.value)}
                    placeholder="15m"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="settings-label">Location (optional)</span>
                  <LocationAutocomplete
                    value={captureLocation}
                    placeholder="Where is the work?"
                    onChange={(text) => setCaptureLocation(text)}
                    onPlaceSelected={(result) => {
                      setCaptureLocation(result.formattedAddress);
                      setCaptureCoords({ lat: result.lat, lng: result.lng });
                    }}
                  />
                </div>

                {!showCaptureDate ? (
                  <button
                    type="button"
                    className="reveal-reminder-link"
                    onClick={() => setShowCaptureDate(true)}
                  >
                    For another day
                  </button>
                ) : (
                  <div className="reminder-date-row">
                    <input
                      type="date"
                      value={captureDate}
                      onChange={(e) => setCaptureDate(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => { setShowCaptureDate(false); setCaptureDate(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {captureError && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{captureError}</p>}
                <button className="btn btn-steel" onClick={addTask}>Add task</button>
              </div>
            </div>
          )}

          {!captureOpen && tasks.length > 0 && (
            <button className="capture-fab" onClick={() => setCaptureOpen(true)} aria-label="Add a task">
              <PlusIcon size={24} />
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
