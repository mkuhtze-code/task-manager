'use client';

import Link from 'next/link';
import type { Task } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';

export type SiblingTask = {
  id: string;
  text: string;
  status: string;
};

/** Minimal meeting shape for cross-surface links (Today may load a subset). */
export type ConnectedMeeting = {
  id: string;
  text: string;
  duration_mins: number;
  start_time: string | null;
  job_id?: string | null;
  source?: string;
};

/** Meetings filed under the same job as this task. */
export function relatedMeetingsForTask(
  task: Task,
  meetings: ConnectedMeeting[]
): ConnectedMeeting[] {
  if (!task.job_id) return [];
  const list = meetings.filter((m) => m.job_id === task.job_id);
  const now = Date.now();
  return list.sort((a, b) => {
    const at = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
    const aPast = at < now;
    const bPast = bt < now;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return at - bt;
  });
}

function meetingWhen(m: ConnectedMeeting): string {
  return fmtMeetingWindow(m.start_time, m.duration_mins);
}

/**
 * Deliberate cross-surface graph for the desktop task pane.
 * Shows how this task sits with its Job and related Meetings so the user
 * does not have to navigate products to reconstruct context.
 */
export function TaskConnections(props: {
  task: Task;
  job: Job | null;
  meetings: ConnectedMeeting[];
  siblingTasks?: SiblingTask[];
  showEmptyHint?: boolean;
  onOpenSibling?: (taskId: string) => void;
}) {
  const { task, job, meetings, siblingTasks = [], showEmptyHint = true, onOpenSibling } = props;

  const related = relatedMeetingsForTask(task, meetings);
  const siblings = siblingTasks.filter((t) => t.id !== task.id).slice(0, 6);

  const hasJob = !!job;
  const hasMeetings = related.length > 0;
  const hasSiblings = siblings.length > 0;
  const hasAnything = hasJob || hasMeetings || hasSiblings;

  if (!hasAnything) {
    if (!showEmptyHint) return null;
    return (
      <section className="task-connections" aria-label="Connections">
        <div className="task-connections-head">
          <span className="task-connections-kicker">Connected</span>
          <span className="task-connections-hint">Nothing linked yet</span>
        </div>
        <p className="task-connections-empty">
          File this under a job and Dokkit will surface related meetings and work
          here — so you do not have to go looking.
        </p>
      </section>
    );
  }

  return (
    <section className="task-connections" aria-label="Connections">
      <div className="task-connections-head">
        <span className="task-connections-kicker">Connected</span>
        <span className="task-connections-hint">Across Today, Jobs & Meetings</span>
      </div>

      <div className="task-connections-graph">
        <div className="task-conn-node task-conn-node-task" aria-current="true">
          <span className="task-conn-kind">This task</span>
          <span className="task-conn-title">{task.text}</span>
        </div>

        {(hasJob || hasMeetings) && <div className="task-conn-rail" aria-hidden="true" />}

        {hasJob && job && (
          <Link href={`/jobs/${job.id}`} className="task-conn-node task-conn-node-job">
            <span className="task-conn-kind">Job</span>
            <span className="task-conn-title">{job.name}</span>
            <span className="task-conn-meta">Open workspace →</span>
          </Link>
        )}

        {hasMeetings && (
          <div className="task-conn-group">
            <span className="task-conn-group-label">
              {related.length === 1
                ? 'Meeting on this job'
                : `Meetings on this job · ${related.length}`}
            </span>
            <ul className="task-conn-list">
              {related.slice(0, 5).map((m) => {
                const past =
                  m.start_time != null && new Date(m.start_time).getTime() < Date.now();
                return (
                  <li key={m.id}>
                    <Link
                      href={`/meetings/${m.id}`}
                      className={`task-conn-node task-conn-node-meeting${past ? ' is-past' : ''}`}
                    >
                      <span className="task-conn-kind">{past ? 'Past meeting' : 'Meeting'}</span>
                      <span className="task-conn-title">{m.text}</span>
                      <span className="task-conn-meta mono">{meetingWhen(m)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {hasSiblings && (
          <div className="task-conn-group">
            <span className="task-conn-group-label">
              Other work on this job · {siblings.length}
              {siblingTasks.length > 7 ? '+' : ''}
            </span>
            <ul className="task-conn-list">
              {siblings.map((t) => (
                <li key={t.id}>
                  {onOpenSibling ? (
                    <button
                      type="button"
                      className="task-conn-node task-conn-node-sibling"
                      onClick={() => onOpenSibling(t.id)}
                    >
                      <span className="task-conn-kind">
                        {t.status === 'active' ? 'In progress' : 'Task'}
                      </span>
                      <span className="task-conn-title">{t.text}</span>
                    </button>
                  ) : (
                    <span className="task-conn-node task-conn-node-sibling">
                      <span className="task-conn-kind">Task</span>
                      <span className="task-conn-title">{t.text}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
