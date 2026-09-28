'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { supabase } from '@/lib/supabaseClient';

import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';

import {
  isJobDone,
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

import DesktopJobsHeader, {
  type JobsListFilter,
} from '@/components/DesktopJobsHeader';

import DesktopJobCard, {
  type JobEvidenceSummary,
} from '@/components/DesktopJobCard';

import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import { localDateStr } from '@/lib/timeFormat';

type EvidenceCounts = Record<string, JobEvidenceSummary>;

const EMPTY_EVIDENCE: JobEvidenceSummary = {
  files: 0,
  photos: 0,
  observations: 0,
  meetings: 0,
  siteDays: 0,
};

export default function JobsHome() {
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasksByJob, setTasksByJob] = useState<Record<string, Task[]>>({});
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const [evidenceByJob, setEvidenceByJob] = useState<EvidenceCounts>({});

  const [newJobOpen, setNewJobOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [listFilter, setListFilter] =
    useState<JobsListFilter>('open');

  const [search, setSearch] = useState('');

  const recordEvent = useRecordSurfaceEvent();
  const { isDesktop } = useSurfaceMode();

  const {
    entitlements,
    loading: entLoading,
  } = useEntitlements(session?.user?.id);

  const canJobs = entitlements.canUseJobs;

  useProRedirect(
    !entLoading && Boolean(session),
    canJobs,
    'jobs'
  );

  useEffect(() => {
    if (!isDesktop || !canJobs) return;

    return registerDesktopPrimaryAction(
      'New job',
      () => setNewJobOpen(true)
    );
  }, [isDesktop, canJobs]);

  const clusters = useMemo(
    () => buildClusters(history),
    [history]
  );

  useEffect(() => {
    const {
      data: listener,
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);

        if (!nextSession) {
          setLoading(false);
        }
      }
    );

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      void load();
    }
  }, [session]);

  async function load() {
    setLoading(true);
    setError(null);

    const userId = session.user.id;

    const [
      jobsResult,
      tasksResult,
      historyResult,
      jobMediaResult,
      meetingsResult,
      observationsResult,
      activitiesResult,
    ] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .not('job_id', 'is', null)
        .order('order_index', { ascending: true }),

      supabase
        .from('tasks')
        .select(
          'text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at'
        )
        .eq('user_id', userId)
        .eq('status', 'done')
        .not('actual_mins', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(500),

      supabase
        .from('job_media')
        .select('id, job_id, media_type')
        .eq('user_id', userId),

      supabase
        .from('meetings')
        .select('id, job_id')
        .eq('user_id', userId)
        .not('job_id', 'is', null),

      /*
       * Observations are joined to Jobs through meetings.
       * We fetch the meeting relationship first, then count observations
       * after the meeting list is known.
       */
      supabase
        .from('meeting_observations')
        .select('id, meeting_id')
        .eq('user_id', userId),

      supabase
        .from('activities')
        .select('id, job_id, trip_day_id')
        .eq('user_id', userId)
        .not('job_id', 'is', null),
    ]);

    if (jobsResult.error) {
      console.error(jobsResult.error);
      setError("Jobs couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    if (tasksResult.error) {
      console.error(tasksResult.error);
      setError("Jobs couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    if (jobMediaResult.error) {
      console.error(jobMediaResult.error);
      setError("Job evidence couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    if (meetingsResult.error) {
      console.error(meetingsResult.error);
      setError("Job activity couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    if (observationsResult.error) {
      console.error(observationsResult.error);
      setError("Job observations couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    if (activitiesResult.error) {
      console.error(activitiesResult.error);
      setError("Job site days couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    const jobsList = (jobsResult.data || []) as Job[];
    const tasks = (tasksResult.data || []) as Task[];

    const byJob: Record<string, Task[]> = {};

    for (const task of tasks) {
      if (!task.job_id) continue;

      if (!byJob[task.job_id]) {
        byJob[task.job_id] = [];
      }

      byJob[task.job_id].push(task);
    }

    const counts: EvidenceCounts = {};

    function ensure(jobId: string) {
      if (!counts[jobId]) {
        counts[jobId] = {
          ...EMPTY_EVIDENCE,
        };
      }

      return counts[jobId];
    }

    /*
     * Job media:
     * Every media record is already directly attached to a Job.
     *
     * media_type values currently include photo/audio/file-style records.
     * Files means everything other than photos.
     */
    for (const media of jobMediaResult.data || []) {
      if (!media.job_id) continue;

      const count = ensure(media.job_id);

      if (media.media_type === 'photo') {
        count.photos += 1;
      } else {
        count.files += 1;
      }
    }

    const meetingsById = new Map<string, string>();

    for (const meeting of meetingsResult.data || []) {
      if (!meeting.id || !meeting.job_id) continue;

      meetingsById.set(meeting.id, meeting.job_id);

      const count = ensure(meeting.job_id);
      count.meetings += 1;
    }

    /*
     * Meeting observations are evidence belonging to the Job through
     * their Meeting.
     */
    for (const observation of observationsResult.data || []) {
      const jobId = meetingsById.get(observation.meeting_id);

      if (!jobId) continue;

      const count = ensure(jobId);
      count.observations += 1;
    }

    /*
     * Travel activities are the source of Job site days.
     *
     * Multiple activities can exist on one day, so we count distinct
     * trip-day relationships rather than raw activities.
     */
    const siteDaysByJob = new Map<string, Set<string>>();

    for (const activity of activitiesResult.data || []) {
      if (!activity.job_id || !activity.trip_day_id) continue;

      let days = siteDaysByJob.get(activity.job_id);

      if (!days) {
        days = new Set<string>();
        siteDaysByJob.set(activity.job_id, days);
      }

      days.add(activity.trip_day_id);
    }

    for (const [jobId, days] of siteDaysByJob) {
      const count = ensure(jobId);
      count.siteDays = days.size;
    }

    setJobs(jobsList);
    setTasksByJob(byJob);

    setEvidenceByJob(counts);

    setHistory(
      (historyResult.data || []).map((row: any) => ({
        text: row.text,
        actual_mins: row.actual_mins,
        location_text: row.location_text,
        lat: row.lat,
        lng: row.lng,
        job_id: row.job_id,
        created_at: row.created_at,
        completed_at: row.completed_at,
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
    if (!canJobs) return;

    setSaving(true);
    setError(null);

    const userId = session.user.id;

    const {
      data,
      error: err,
    } = await supabase
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

  const todayStr = localDateStr(new Date());

  const sorted = useMemo(
    () => sortJobsForOverview(jobs, tasksByJob),
    [jobs, tasksByJob]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sorted.filter((job) => {
      const tasks = tasksByJob[job.id] || [];
      const done = isJobDone(tasks);

      if (listFilter === 'open' && done) {
        return false;
      }

      if (listFilter === 'done' && !done) {
        return false;
      }

      if (!query) {
        return true;
      }

      const evidence = evidenceByJob[job.id] || EMPTY_EVIDENCE;

      const searchable = [
        job.name,
        job.client,
        job.location_text,
        ...tasks.map((task) => task.text),
        evidence.files > 0 ? 'files' : '',
        evidence.photos > 0 ? 'photos' : '',
        evidence.observations > 0 ? 'observations' : '',
        evidence.meetings > 0 ? 'meetings' : '',
        evidence.siteDays > 0 ? 'site days' : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    sorted,
    tasksByJob,
    listFilter,
    search,
    evidenceByJob,
  ]);

  const openCount = sorted.filter(
    (job) => !isJobDone(tasksByJob[job.id] || [])
  ).length;

  const doneCount = sorted.length - openCount;

  return (
    <div className="app-shell">
      {!isDesktop && (
        <div className="app-header">
          <div className="app-header-left">
            <Link
              href="/"
              className="back-link"
              aria-label="Back to today"
            >
              <BackIcon />
            </Link>

            <h1 className="app-title">Jobs</h1>
          </div>

          <div className="app-header-right">
            <GearMenu
              context="jobs"
              userId={session?.user.id ?? null}
            />
          </div>
        </div>
      )}

      {isDesktop && !loading && (
        <DesktopJobsHeader
          openCount={openCount}
          doneCount={doneCount}
          allCount={sorted.length}
          filter={listFilter}
          onFilterChange={setListFilter}
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setNewJobOpen(true)}
        />
      )}

      {error && (
        <button
          className="recalc-error"
          onClick={() => void load()}
          disabled={loading}
        >
          {error}
        </button>
      )}

      {!loading && !isDesktop && sorted.length > 0 && (
        <div
          className="jobs-filter-row job-list-filter-sticky"
          style={{
            display: 'flex',
            gap: 8,
            padding:
              '8px var(--space-page, 16px) 10px',
            flexWrap: 'wrap',
          }}
        >
          {[
            {
              key: 'open' as const,
              label: `Open${
                openCount ? ` · ${openCount}` : ''
              }`,
            },
            {
              key: 'done' as const,
              label: `Done${
                doneCount ? ` · ${doneCount}` : ''
              }`,
            },
            {
              key: 'all' as const,
              label: 'All',
            },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={
                listFilter === key
                  ? 'segmented-btn active'
                  : 'segmented-btn'
              }
              style={{
                minHeight: 32,
                fontSize: 12,
                padding: '0 12px',
              }}
              onClick={() => setListFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading || entLoading ? (
        <div className="empty-state">
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            No jobs yet.
          </div>

          <div className="empty-state-sub">
            Group work that spans days. A job gathers its
            tasks, evidence and context together.
          </div>

          <button
            className="btn btn-steel"
            onClick={() => setNewJobOpen(true)}
          >
            Create a job
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            Nothing in this list.
          </div>

          <div className="empty-state-sub">
            Try another filter or search.
          </div>
        </div>
      ) : isDesktop ? (
        <div className="desk-jobs-grid">
          {filtered.map((job) => {
            const tasks = tasksByJob[job.id] || [];
            const done = isJobDone(tasks);

            const todayTasks = tasks.filter(
              (task) => task.surface_date === todayStr
            );

            const nextTask =
              tasks.find((task) => task.status !== 'done') ||
              null;

            return (
              <DesktopJobCard
                key={job.id}
                job={job}
                tasks={tasks}
                evidence={
                  evidenceByJob[job.id] ||
                  EMPTY_EVIDENCE
                }
                todayCount={todayTasks.length}
                nextTask={nextTask}
                done={done}
              />
            );
          })}
        </div>
      ) : (
        <div className="job-list">
          {filtered.map((job) => {
            const tasks = tasksByJob[job.id] || [];
            const done = isJobDone(tasks);

            const onToday = tasks.filter(
              (task) => task.surface_date === todayStr
            ).length;

            const nextTask =
              tasks.find((task) => task.status !== 'done') ||
              null;

            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className={
                  done
                    ? 'job-row completed'
                    : 'job-row'
                }
              >
                <div className="job-row-top">
                  <span className="job-row-name">
                    {job.name}
                  </span>

                  {done ? (
                    <span
                      className="job-row-done-mark"
                      aria-label="Complete"
                    >
                      <CheckIcon done />
                    </span>
                  ) : (
                    <span className="job-row-numeral mono">
                      {tasks.length}
                    </span>
                  )}
                </div>

                {(job.client ||
                  onToday > 0 ||
                  job.location_text) && (
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
                    {job.client && (
                      <span>{job.client}</span>
                    )}

                    {onToday > 0 && (
                      <span>
                        {onToday === 1
                          ? '1 on today'
                          : `${onToday} on today`}
                      </span>
                    )}

                    {job.location_text && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
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

                {!done && nextTask && (
                  <div
                    className="job-row-next"
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color:
                        'var(--ink-muted, var(--ink-faint))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Next: {nextTask.text}
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
        onNavigate={(surface) =>
          recordEvent(surface, true)
        }
        onAdd={
          !newJobOpen && sorted.length > 0
            ? () => setNewJobOpen(true)
            : undefined
        }
        addLabel="New job"
      />
    </div>
  );
}
