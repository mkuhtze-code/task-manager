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
import SurfaceHeaderIdentity from '@/components/SurfaceHeaderIdentity';
import { NewJobSheet } from '@/components/JobSheets';
import { CheckIcon, MapPinIcon } from '@/components/icons';

import DesktopJobsHeader, {
  type JobsListFilter,
} from '@/components/DesktopJobsHeader';

import DesktopJobCard, {
  type JobEvidenceSummary,
} from '@/components/DesktopJobCard';

import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import { localDateStr } from '@/lib/timeFormat';
import SurfaceDateCarousel from '@/components/SurfaceDateCarousel';
import { ExperienceFilterBar } from '@/components/ExperienceFilterBar';
import { useSurfaceReturnState } from '@/hooks/useSurfaceReturnState';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useSurfaceReturnState(
    session?.user?.id ? `dokkit.surface-return.${session.user.id}.jobs.v1` : null,
    { listFilter, search, selectedDate },
    (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (saved.listFilter === 'open' || saved.listFilter === 'done' || saved.listFilter === 'all') {
        setListFilter(saved.listFilter);
      }
      if (typeof saved.search === 'string') setSearch(saved.search);
      if (
        saved.selectedDate === null ||
        (typeof saved.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.selectedDate))
      ) {
        setSelectedDate(saved.selectedDate);
      }
    },
    !loading,
  );

  const { isDesktop } = useSurfaceMode();

  const {
    entitlements,
    loading: entLoading,
  } = useEntitlements(session?.user?.id);

  const canJobs = entitlements.canUseJobs;

  useEffect(() => {
    if (!canJobs) return;
    return registerDesktopPrimaryAction('New job', () => setNewJobOpen(true));
  }, [canJobs]);

  useProRedirect(
    !entLoading && Boolean(session),
    canJobs,
    'jobs'
  );


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

      if (
        selectedDate &&
        !tasks.some((task) =>
          task.surface_date === selectedDate ||
          (selectedDate === todayStr && task.due_today)
        )
      ) {
        return false;
      }

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
    selectedDate,
    todayStr,
  ]);

  const openCount = sorted.filter(
    (job) => !isJobDone(tasksByJob[job.id] || [])
  ).length;

  const doneCount = sorted.length - openCount;

  const todayKey = localDateStr(new Date());
  let activeTodayCount = 0;
  let attentionCount = 0;
  let spotlightJobName: string | null = null;
  for (const job of sorted) {
    const jobTasks = tasksByJob[job.id] || [];
    if (isJobDone(jobTasks)) continue;
    const openTasks = jobTasks.filter((t) => t.status !== 'done');
    const onToday = openTasks.some(
      (t) =>
        t.due_today ||
        (t.surface_date != null && String(t.surface_date).slice(0, 10) === todayKey)
    );
    if (onToday) {
      activeTodayCount += 1;
      if (!spotlightJobName) spotlightJobName = job.name;
    }
    if (openTasks.length === 0) {
      attentionCount += 1;
    }
  }

  return (
    <div className="app-shell jobs-shell">
      {!isDesktop && (
        <div className="app-header">
          <div className="app-header-left">
            <div className="jobs-mobile-identity surface-mobile-identity">
              <SurfaceHeaderIdentity
                kicker="Work / Field"
                title="Jobs"
                signal={activeTodayCount > 0 ? `${activeTodayCount} active` : openCount > 0 ? `${openCount} open` : 'Clear'}
                meta={spotlightJobName ? `Focus: ${spotlightJobName}` : attentionCount > 0 ? `${attentionCount} need attention` : `${doneCount} completed`}
                attention={attentionCount > 0}
                clear={openCount === 0}
              />
            </div>
          </div>

          <div className="app-header-right">
            {canJobs && (
              <button type="button" className="btn btn-steel ux-button ux-button--primary" onClick={() => setNewJobOpen(true)}>
                New job
              </button>
            )}
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
          activeTodayCount={activeTodayCount}
          attentionCount={attentionCount}
          spotlightJobName={spotlightJobName}
          filter={listFilter}
          onFilterChange={setListFilter}
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setNewJobOpen(true)}
        />
      )}

      {!loading && sorted.length > 0 && (
        <SurfaceDateCarousel selectedDate={selectedDate} onChange={setSelectedDate} />
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
        <ExperienceFilterBar
          ariaLabel="Job filters"
          value={listFilter}
          onChange={setListFilter}
          className="jobs-filter-row job-list-filter-sticky"
          options={[
            { key: 'open', label: 'Open', count: openCount },
            { key: 'done', label: 'Done', count: doneCount },
            { key: 'all', label: 'All' },
          ]}
        />
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
            Create a job to keep its work together.
          </div>
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
            const openTasks = tasks.filter((task) => task.status !== 'done').length;

            return (
              <Link
                key={job.id}
                href={'/jobs/' + job.id}
                aria-label={job.name + ', ' + (done ? 'complete' : openTasks + ' open tasks')}
                className={done ? 'job-row completed experience-job-stream__item' : 'job-row experience-job-stream__item'}
                data-experience-object="job"
                data-object-state={done ? 'complete' : 'open'}
                data-job-id={job.id}
              >
                <div className="job-row-top" data-experience-part="summary">
                  <span className="job-row-name" data-experience-part="title">{job.name}</span>
                  {done ? (
                    <span className="job-row-done-mark" data-experience-part="state" aria-label="Complete">
                      <CheckIcon done />
                    </span>
                  ) : (
                    <span className="job-row-numeral mono" data-experience-part="state" aria-label={openTasks + ' open tasks'}>
                      {openTasks} open
                    </span>
                  )}
                </div>

                {(job.client || onToday > 0 || job.location_text) && (
                  <div className="job-row-meta" data-experience-part="glance">
                    {job.client ? <span>{job.client}</span> : null}
                    {onToday > 0 ? <span>{onToday === 1 ? '1 today' : onToday + ' today'}</span> : null}
                    {job.location_text ? (
                      <span className="job-row-location">
                        <MapPinIcon size={12} />
                        <span>{job.location_text}</span>
                      </span>
                    ) : null}
                  </div>
                )}

                {!done && nextTask ? (
                  <div className="job-row-next" data-experience-part="evidence" title={nextTask.text}>
                    <span className="mono">NEXT</span> {nextTask.text}
                  </div>
                ) : null}
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


    </div>
  );
}
