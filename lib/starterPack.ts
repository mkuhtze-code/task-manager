/**
 * Disposable starter content after onboarding.
 *
 * Examples only — never train duration memory or prediction_log.
 * Marked source = 'starter'. User can clear in one action.
 */

import type { OnboardingAnswers } from '@/lib/onboardingTypes';
import type { UserProfile } from '@/lib/userProfile';
import { localDateStr } from '@/lib/timeFormat';

export const STARTER_SOURCE = 'starter' as const;
export const STARTER_JOB_NAME_PREFIX = 'Example · ';

export type StarterTaskSpec = {
  text: string;
  estimateMins: number;
  /** Attach to the starter job when one is created. */
  onJob?: boolean;
};

export type StarterPackSpec = {
  /** Optional single example job (trades / client work). */
  jobName?: string;
  jobClient?: string | null;
  tasks: StarterTaskSpec[];
  /** Quiet line under empty/first session — not a tour. */
  welcomeLine: string;
};

/** Role-matched examples. Short. Deletable. */
export function buildStarterPackSpec(
  answers: OnboardingAnswers,
  profile: UserProfile
): StarterPackSpec {
  const role = answers.role;
  const work = answers.workType;

  if (role === 'professional' && work === 'trades_field') {
    return {
      jobName: 'Example · Sample site',
      jobClient: 'Demo client',
      welcomeLine: 'A few example site tasks — delete anytime.',
      tasks: [
        { text: 'Measure up on site', estimateMins: 45, onJob: true },
        { text: 'Order materials', estimateMins: 20, onJob: true },
        { text: 'Call back supplier', estimateMins: 15 },
      ],
    };
  }

  if (role === 'professional' && (work === 'client_services' || work === 'operations')) {
    return {
      jobName: profile.jobsEmphasis !== 'off' ? 'Example · Active client' : undefined,
      jobClient: 'Demo',
      welcomeLine: 'Example work items so the day isn’t empty.',
      tasks: [
        { text: 'Prep for client call', estimateMins: 30, onJob: true },
        { text: 'Send follow-up notes', estimateMins: 15, onJob: true },
        { text: 'Clear inbox admin', estimateMins: 25 },
      ],
    };
  }

  if (role === 'professional' && work === 'creative') {
    return {
      jobName: 'Example · Current project',
      welcomeLine: 'A light project shape — change or remove freely.',
      tasks: [
        { text: 'Sketch first pass', estimateMins: 60, onJob: true },
        { text: 'Gather references', estimateMins: 30, onJob: true },
        { text: 'Admin / invoices', estimateMins: 20 },
      ],
    };
  }

  if (role === 'student') {
    return {
      welcomeLine: 'A few study examples — clear when you’re ready.',
      tasks: [
        { text: 'Read assigned chapter', estimateMins: 45 },
        { text: 'Draft assignment outline', estimateMins: 40 },
        { text: 'Review lecture notes', estimateMins: 25 },
      ],
    };
  }

  if (role === 'personal') {
    return {
      welcomeLine: 'A couple of everyday examples — nothing permanent.',
      tasks: [
        { text: 'Book an appointment', estimateMins: 15 },
        { text: 'Pay a bill', estimateMins: 10 },
        { text: 'Reply to that message', estimateMins: 10 },
      ],
    };
  }

  // knowledge_worker / other
  return {
    welcomeLine: 'Starter tasks so Today isn’t blank — remove whenever.',
    tasks: [
      { text: 'Block focus time for deep work', estimateMins: 50 },
      { text: 'Triage messages', estimateMins: 20 },
      { text: 'Plan the next step on a project', estimateMins: 25 },
    ],
  };
}

export function isStarterTask(task: { source?: string | null }): boolean {
  return task.source === STARTER_SOURCE;
}

/**
 * Insert starter job + tasks for a newly onboarded user.
 * Best-effort; failures are logged and never block onboarding.
 */
export async function seedStarterPack(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  answers: OnboardingAnswers,
  profile: UserProfile
): Promise<{ taskCount: number; jobId: string | null }> {
  const spec = buildStarterPackSpec(answers, profile);
  const today = localDateStr(new Date());
  let jobId: string | null = null;

  try {
    if (spec.jobName && profile.jobsEmphasis !== 'off') {
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          user_id: userId,
          name: spec.jobName,
          client: spec.jobClient ?? null,
        })
        .select('id')
        .single();
      if (!jobErr && job?.id) jobId = job.id as string;
    }

    const rows = spec.tasks.map((t, i) => ({
      user_id: userId,
      text: t.text,
      status: 'pending',
      source: STARTER_SOURCE,
      estimate_mins: t.estimateMins,
      logged_mins: 0,
      due_today: true,
      surface_date: today,
      order_index: i,
      job_id: t.onJob && jobId ? jobId : null,
      original_input: '__dokkit_starter__',
      info: '',
    }));

    const { error } = await supabase.from('tasks').insert(rows);
    if (error) {
      console.error('[starterPack] insert tasks', error);
      return { taskCount: 0, jobId };
    }
    return { taskCount: rows.length, jobId };
  } catch (e) {
    console.error('[starterPack] seed failed', e);
    return { taskCount: 0, jobId: null };
  }
}

/** Remove all starter tasks (and example jobs with the Example · prefix). */
export async function clearStarterPack(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<void> {
  await supabase
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .eq('source', STARTER_SOURCE);

  await supabase
    .from('jobs')
    .delete()
    .eq('user_id', userId)
    .like('name', `${STARTER_JOB_NAME_PREFIX}%`);
}
