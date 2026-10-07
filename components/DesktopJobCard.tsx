'use client';

import Link from 'next/link';
import { CheckIcon, MapPinIcon } from '@/components/icons';
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

  const hasEvidence =
    evidence.files > 0 ||
    evidence.photos > 0 ||
    evidence.observations > 0;

  const hasActivity =
    evidence.meetings > 0 || evidence.siteDays > 0;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={done ? 'desk-job-card surface-object completed' : 'desk-job-card surface-object'}
    >
      <div className="desk-job-card-head">
        <div className="desk-job-card-identity">
          <span className="desk-job-card-name surface-object-title">{job.name}</span>

          {job.client && (
            <span className="desk-job-card-client">{job.client}</span>
          )}
        </div>

        {done ? (
          <span className="desk-job-card-status done" aria-label="Complete">
            <CheckIcon done />
          </span>
        ) : (
          <span className="desk-job-card-status">Open</span>
        )}
      </div>

      {todayCount > 0 || job.location_text ? (
        <ContextLine
          className="desk-job-card-context"
          items={[
            ...(todayCount > 0
              ? [{ label: todayCount === 1 ? 'Today · 1 task' : `Today · ${todayCount} tasks`, href: '/' }]
              : []),
            ...(job.location_text ? [{ label: job.location_text }] : []),
          ]}
        />
      ) : null}

      <div className="desk-job-card-state surface-object-time">
        <span className="mono">{openTasks}</span> open
        <span aria-hidden="true"> · </span>
        <span className="mono">{completedTasks}</span> done
        {todayCount > 0 ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="mono">{todayCount}</span> today
          </>
        ) : null}
      </div>

      {next && !done && (
        <div className="desk-job-card-next">
          <span className="desk-job-card-section-label">Next</span>
          <span className="desk-job-card-next-text">{next}</span>
        </div>
      )}

      {hasEvidence && (
        <div className="desk-job-card-section">
          <span className="desk-job-card-section-label">Evidence</span>

          <div className="desk-job-card-chips">
            {evidence.files > 0 && (
              <span className="desk-job-card-chip">
                <strong className="mono">{evidence.files}</strong>
                {evidence.files === 1 ? ' file' : ' files'}
              </span>
            )}

            {evidence.photos > 0 && (
              <span className="desk-job-card-chip">
                <strong className="mono">{evidence.photos}</strong>
                {evidence.photos === 1 ? ' photo' : ' photos'}
              </span>
            )}

            {evidence.observations > 0 && (
              <span className="desk-job-card-chip">
                <strong className="mono">{evidence.observations}</strong>
                {evidence.observations === 1
                  ? ' observation'
                  : ' observations'}
              </span>
            )}
          </div>
        </div>
      )}

      {hasActivity && (
        <div className="desk-job-card-section">
          <span className="desk-job-card-section-label">Activity</span>

          <div className="desk-job-card-chips">
            {evidence.meetings > 0 && (
              <span className="desk-job-card-chip">
                <strong className="mono">{evidence.meetings}</strong>
                {evidence.meetings === 1 ? ' meeting' : ' meetings'}
              </span>
            )}

            {evidence.siteDays > 0 && (
              <span className="desk-job-card-chip">
                <strong className="mono">{evidence.siteDays}</strong>
                {evidence.siteDays === 1 ? ' site day' : ' site days'}
              </span>
            )}
          </div>
        </div>
      )}

      {!hasEvidence && !hasActivity && tasks.length === 0 && (
        <div className="desk-job-card-quiet">
          No work or evidence captured yet.
        </div>
      )}
    </Link>
  );
}
