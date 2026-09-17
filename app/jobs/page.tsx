'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';
import {
  isJobDone,
  jobNumeral,
  jobOverviewMeta,
  sortJobsForOverview,
} from '@/lib/jobUtils';
import {
  buildClusters,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import GearMenu from '@/components/GearMenu';
import { NewJobSheet } from '@/components/JobSheets';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, CheckIcon, MapPinIcon } from '@/components/icons';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import { localDateStr } from '@/lib/timeFormat';

export default function JobsHome() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasksByJob, setTasksByJob] = useState<Record<string, Task[]>>({});
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 'open' = active jobs only; 'done' = completed; 'all' = everything */
  const [listFilter, setListFilter] = useState<'open' | 'done' | 'all'>('open');
  const recordEvent = useRecordSurfaceEvent();

  const clusters = useMemo(() => buildClusters(history), [history]);
  const todayStr = localDateStr(new Date());

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

    const { data: historyRows } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at')
      .eq('user_id', userId)
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500);

    const jobsList = (jobRows as Job[]) || [];
    const tasks = (taskRows as Task[]) || [];
    const byJob: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.job_id) continue;
      (byJob[t.job_id] = byJob[t.job_id] || []).push(t);
    }

    setJobs(jobsList);
    setTasksByJob(byJob);
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
    setLoading(false);
  }

  async function createJob(
    name: string,
    client: string,
    locationText: string,
    lat: number | null,
    lng: number | null
  ) {
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
  const filtered = sorted.filter((job) => {
    const done = isJobDone(tasksByJob[job.id] || []);
    if (listFilter === 'open') return !done;
    if (listFilter === 'done') return done;
    return true;
  });

  const openCount = sorted.filter((j) => !isJobDone(tasksByJob[j.id] || [])).length;
  const doneCount = sorted.length - openCount;

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
          <GearMenu context="jobs" userId={session?.user.id ?? null} />
        </div>
      </div>

      {error && (
        <button className="recalc-error" onClick={load} disabled={loading}>
          {error}
        </button>
      )}

      {!loading && sorted.length > 0 && (
        <div
          className="jobs-filter-row"
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 var(--space-page, 16px) var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { key: 'open' as const, label: `Open${openCount ? ` · ${openCount}` : ''}` },
              { key: 'done' as const, label: `Done${doneCount ? ` · ${doneCount}` : ''}` },
              { key: 'all' as const, label: 'All' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={listFilter === key ? 'segmented-btn active' : 'segmented-btn'}
              style={{ minHeight: 32, fontSize: 12, padding: '0 12px' }}
              onClick={() => setListFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No jobs yet.</div>
          <div className="empty-state-sub">
            Group work that spans days — a job shows its tasks and your progress at a glance.
          </div>
          <button className="btn btn-steel" onClick={() => setNewJobOpen(true)}>
            Create a job
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            {listFilter === 'done' ? 'No completed jobs yet.' : 'Nothing in this list.'}
          </div>
          <div className="empty-state-sub">
            {listFilter === 'done'
              ? 'Jobs show as done when every task on them is finished.'
              : 'Try Open or All.'}
          </div>
        </div>
      ) : (
        <div className="job-list">
          {filtered.map((job) => {
            const tasks = tasksByJob[job.id] || [];
            const done = isJobDone(tasks);
            const meta = jobOverviewMeta(job, tasks, todayStr);
            const numeral = jobNumeral(tasks, history, clusters);

            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className={done ? 'job-row completed' : 'job-row'}
              >
                <div className="job-row-top">
                  <span className="job-row-name">{job.name}</span>
                  {done ? (
                    <span className="job-row-done-mark" aria-label="Complete">
                      <CheckIcon done />
                    </span>
                  ) : (
                    <span className="job-row-numeral mono">{numeral}</span>
                  )}
                </div>

                {!done && (meta.clientLine || meta.onToday > 0 || job.location_text) && (
                  <div
                    className="job-row-meta"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px 12px',
                      marginTop: 4,
                      fontSize: 12,
                      color: 'var(--ink-faint)',
                      alignItems: 'center',
                    }}
                  >
                    {meta.clientLine && <span>{meta.clientLine}</span>}
                    {meta.onToday > 0 && (
                      <span>
                        {meta.onToday === 1 ? '1 on today' : `${meta.onToday} on today`}
                      </span>
                    )}
                    {job.location_text && (
                      <span
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <MapPinIcon size={12} />
                        <span
                          style={{
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {job.location_text}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {!done && meta.nextLabel && (
                  <div
                    className="job-row-next"
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: 'var(--ink-muted, var(--ink-faint))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Next: {meta.nextLabel}
                  </div>
                )}
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

      <SurfaceNav
        active="jobs"
        onNavigate={(s) => recordEvent(s, true)}
        onAdd={!newJobOpen && sorted.length > 0 ? () => setNewJobOpen(true) : undefined}
        addLabel="New job"
      />
    </div>
  );
}
