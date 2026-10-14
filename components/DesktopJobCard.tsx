'use client';

import Link from 'next/link';
import { CheckIcon } from '@/components/icons';
import ContextLine from '@/components/ContextLine';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';

export type JobEvidenceSummary = {
  files: number;
  photos: number;
  observations: number;
  meetings: number;
  siteDays: number;
};

type Props = {
  job: Job;
  tasks: Task[];
  evidence: JobEvidenceSummary;
  todayCount: number;
  nextTask: Task | null;
  done: boolean;
};

function taskLabel(task: Task | null): string | null {
  if (!task) return null;
  const text = task.text?.trim();
  return text || null;
}

export default function DesktopJobCard({
  job,
  tasks,
  evidence,
  todayCount,
  nextTask,
  done,
}: Props) {
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const openTasks = tasks.length - completedTasks;
  const next = taskLabel(nextTask);

  const evidenceParts = [
    evidence.files > 0 ? evidence.files + (evidence.files === 1 ? ' file' : ' files') : '',
    evidence.photos > 0 ? evidence.photos + (evidence.photos === 1 ? ' photo' : ' photos') : '',
    evidence.observations > 0 ? evidence.observations + (evidence.observations === 1 ? ' observation' : ' observations') : '',
    evidence.meetings > 0 ? evidence.meetings + (evidence.meetings === 1 ? ' meeting' : ' meetings') : '',
    evidence.siteDays > 0 ? evidence.siteDays + (evidence.siteDays === 1 ? ' site day' : ' site days') : '',
  ].filter(Boolean);
  const evidenceSummary = evidenceParts.join(' · ');
  return (
    <Link
      href={`/jobs/${job.id}`}
      className={done ? 'desk-job-card surface-object completed' : 'desk-job-card surface-object'}
    >
      <div className="desk-job-card-head">
        <div className="desk-job-card-identity">
          <span className="desk-job-card-name surface-object-title">{job.name}</span>
        </div>

        {done ? (
          <span className="desk-job-card-status done" aria-label="Complete">
            <CheckIcon done />
          </span>
        ) : (
          <span className="desk-job-card-status mono" aria-label={openTasks + ' open tasks'}>{openTasks} open</span>
        )}
      </div>

      {job.client || todayCount > 0 || job.location_text ? (
        <ContextLine
          className="desk-job-card-context"
          items={[
            ...(job.client ? [{ label: job.client }] : []),
            ...(todayCount > 0
              ? [{ label: todayCount === 1 ? 'Today · 1 task' : 'Today · ' + todayCount + ' tasks', href: '/' }]
              : []),
            ...(job.location_text ? [{ label: job.location_text }] : []),
          ]}
        />
      ) : null}

      {next && !done ? (
        <div className="desk-job-card-next mono" title={next}>
          <span className="desk-job-card-section-label">Next</span> {next}
        </div>
      ) : null}

      {evidenceSummary ? (
        <div className="desk-job-card-summary mono" title={evidenceSummary} aria-label={'Evidence and activity: ' + evidenceSummary}>
          {evidenceSummary}
        </div>
      ) : null}

      {!evidenceSummary && tasks.length === 0 ? (
        <div className="desk-job-card-quiet">No work or evidence captured yet.</div>
      ) : null}
    </Link>
  );
}
