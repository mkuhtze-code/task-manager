'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';
import { isJobDone, jobNumeral, sortJobsForOverview } from '@/lib/jobUtils';
import GearMenu from '@/components/GearMenu';
import { NewJobSheet } from '@/components/JobSheets';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, CheckIcon, MapPinIcon, PlusIcon } from '@/components/icons';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';

export default function JobsHome() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasksByJob, setTasksByJob] = useState<Record<string, Task[]>>({});
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const recordEvent = useRecordSurfaceEvent();

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

    const { data: jobRows, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (jobErr) {
      console.error(jobErr);
      setError("Jobs couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    const { data: taskRows, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .not('job_id', 'is', null)
      .order('order_index', { ascending: true });
    if (taskErr) {
      console.error(taskErr);
      setError("Jobs couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    const jobsList = (jobRows as Job[]) || [];
    const tasks = (taskRows as Task[]) || [];
    const byJob: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.job_id) continue;
      (byJob[t.job_id] = byJob[t.job_id] || []).push(t);
    }

    setJobs(jobsList);
    setTasksByJob(byJob);
    setLoading(false);
  }

  async function createJob(name: string, client: string, locationText: string, lat: number | null, lng: number | null) {
    setSaving(true);
    setError(null);
    const userId = session.user.id;
    const { data, error: err } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        name,
        client: client || null,
        location_text: locationText || null,
        lat,
        lng,
      })
      .select('id')
      .single();
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Couldn't create the job");
      return;
    }
    setNewJobOpen(false);
    router.push(`/jobs/${data.id}`);
  }

  const sorted = sortJobsForOverview(jobs, tasksByJob);

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <Link href="/" className="back-link" aria-label="Back to today">
            <BackIcon />
          </Link>
          <h1 className="app-title">Jobs</h1>
        </div>
        <div className="app-header-right">
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
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No jobs yet.</div>
          <div className="empty-state-sub">Group work that spans days — a job shows its tasks and your progress at a glance.</div>
          <button className="btn btn-steel" onClick={() => setNewJobOpen(true)}>Create a job</button>
        </div>
      ) : (
        <div className="job-list">
          {sorted.map((job) => {
            const tasks = tasksByJob[job.id] || [];
            const done = isJobDone(tasks);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className={done ? 'job-row completed' : 'job-row'}>
                <div className="job-row-top">
                  <span className="job-row-name">{job.name}</span>
                  {done ? (
                    <span className="job-row-done-mark" aria-label="Complete"><CheckIcon done /></span>
                  ) : job.location_text ? (
                    <span className="job-row-map-icon" aria-label="Has location"><MapPinIcon size={14} /></span>
                  ) : (
                    <span className="job-row-numeral">{jobNumeral(tasks)}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {newJobOpen && (
        <NewJobSheet
          saving={saving}
          onClose={() => setNewJobOpen(false)}
          onCreate={createJob}
        />
      )}

      {!newJobOpen && sorted.length > 0 && (
        <button className="capture-fab" onClick={() => setNewJobOpen(true)} aria-label="New job">
          <PlusIcon size={24} />
        </button>
      )}

      <SurfaceNav active="jobs" onNavigate={(s) => recordEvent(s, true)} />
    </div>
  );
}
