'use client';

import Link from 'next/link';
import type { Meeting } from '@/lib/meetingTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';

export type ConnectedTask = {
  id: string;
  text: string;
  status: string;
};

/**
 * Cross-surface graph for a Meeting: Job workspace + open work on that job +
 * sibling meetings. Same philosophy as TaskConnections — Dokkit shows the
 * links so the user does not have to reconstruct them by navigating.
 */
export function MeetingConnections(props: {
  meeting: Meeting;
  job: Job | null;
  jobTasks?: ConnectedTask[];
  siblingMeetings?: Meeting[];
  /** All jobs for "link to a job" when none is set. */
  allJobs?: Job[];
  onLinkJob?: (jobId: string | null) => void;
  linking?: boolean;
}) {
  const {
    meeting,
    job,
    jobTasks = [],
    siblingMeetings = [],
    allJobs = [],
    onLinkJob,
    linking = false,
  } = props;

  const openTasks = jobTasks.filter((t) => t.status !== 'done').slice(0, 6);
  const siblings = siblingMeetings.filter((m) => m.id !== meeting.id).slice(0, 5);

  const hasJob = !!job;
  const hasTasks = openTasks.length > 0;
  const hasSiblings = siblings.length > 0;

  return (
    <section className="task-connections meeting-connections" aria-label="Connections">
      <div className="task-connections-head">
        <span className="task-connections-kicker">Connected</span>
        <span className="task-connections-hint">Across Meetings, Jobs & Today</span>
      </div>

      <div className="task-connections-graph">
        <div className="task-conn-node task-conn-node-task" aria-current="true">
          <span className="task-conn-kind">This meeting</span>
          <span className="task-conn-title">{meeting.text}</span>
          <span className="task-conn-meta mono">
            {fmtMeetingWindow(meeting.start_time, meeting.duration_mins)}
          </span>
        </div>

        {(hasJob || hasTasks || hasSiblings || !hasJob) && (
          <div className="task-conn-rail" aria-hidden="true" />
        )}

        {hasJob && job && (
          <Link href={`/jobs/${job.id}`} className="task-conn-node task-conn-node-job">
            <span className="task-conn-kind">Job</span>
            <span className="task-conn-title">{job.name}</span>
            {job.client ? (
              <span className="task-conn-meta">{job.client}</span>
            ) : (
              <span className="task-conn-meta">Open workspace →</span>
            )}
          </Link>
        )}

        {!hasJob && onLinkJob && allJobs.length > 0 && (
          <div className="task-conn-group">
            <span className="task-conn-group-label">Link to a job</span>
            <p className="task-connections-empty" style={{ marginBottom: 8 }}>
              File this meeting under a job and Dokkit will surface related tasks
              and other meetings here.
            </p>
            <ul className="task-conn-list">
              {allJobs.slice(0, 8).map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    className="task-conn-node task-conn-node-job"
                    disabled={linking}
                    onClick={() => onLinkJob(j.id)}
                  >
                    <span className="task-conn-kind">Job</span>
                    <span className="task-conn-title">{j.name}</span>
                    <span className="task-conn-meta">{linking ? 'Linking…' : 'Tap to link'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasJob && (!onLinkJob || allJobs.length === 0) && (
          <p className="task-connections-empty">
            No job linked. Record or edit the meeting with a job, or create a job
            first — then Dokkit can connect the work.
          </p>
        )}

        {hasTasks && (
          <div className="task-conn-group">
            <span className="task-conn-group-label">
              Open work on this job · {openTasks.length}
              {jobTasks.filter((t) => t.status !== 'done').length > 6 ? '+' : ''}
            </span>
            <ul className="task-conn-list">
              {openTasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={job ? `/jobs/${job.id}` : '/'}
                    className="task-conn-node task-conn-node-sibling"
                  >
                    <span className="task-conn-kind">
                      {t.status === 'active' ? 'In progress' : 'Task'}
                    </span>
                    <span className="task-conn-title">{t.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasSiblings && (
          <div className="task-conn-group">
            <span className="task-conn-group-label">
              Other meetings on this job · {siblings.length}
            </span>
            <ul className="task-conn-list">
              {siblings.map((m) => {
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
                      <span className="task-conn-meta mono">
                        {fmtMeetingWindow(m.start_time, m.duration_mins)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {hasJob && onLinkJob && (
          <button
            type="button"
            className="btn-text"
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
            disabled={linking}
            onClick={() => onLinkJob(null)}
          >
            Unlink job
          </button>
        )}
      </div>
    </section>
  );
}
