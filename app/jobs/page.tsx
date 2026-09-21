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
    }

    const byJob: Record<string, Task[]> = {};
    for (const row of taskRows || []) {
      const jid = (row as Task).job_id;
      if (!jid) continue;
      if (!byJob[jid]) byJob[jid] = [];
      byJob[jid].push(row as Task);
    }

    const { data: histRows } = await supabase
      .from('tasks')
      .select('text, estimate_mins, logged_mins, location_text, job_id, status')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(400);

    setJobs((jobRows || []) as Job[]);
    setTasksByJob(byJob);
    setHistory((histRows || []) as HistoricalTask[]);
    setLoading(false);
  }

  // NOTE: truncated restore - full file needed
  return <div className="app-shell">Jobs</div>;
}
