'use client';

import { useMemo, useState } from 'react';
import type { Job } from '@/lib/jobTypes';
import { ChevronIcon } from '@/components/icons';

export function TaskJobField(props: {
  jobs: Job[];
  jobId: string | null | undefined;
  onMoveToJob: (jobId: string | null) => void;
  compact?: boolean;
}) {
  const {
    jobs,
    jobId,
    onMoveToJob,
    compact = false,
  } = props;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const linkedJob = jobId
    ? jobs.find((job) => job.id === jobId) ?? null
    : null;

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return jobs;

    return jobs.filter((job) =>
      (job.name ?? '').toLowerCase().includes(query)
    );
  }, [jobs, search]);

  function close() {
    setOpen(false);
    setSearch('');
  }

  function choose(id: string | null) {
    onMoveToJob(id);
    close();
  }

  return (
    <div className={compact ? 'task-job-field compact' : 'task-job-field'}>
      <button
        type="button"
        className={open ? 'task-job-trigger open' : 'task-job-trigger'}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        aria-expanded={open}
      >
        <span className="task-job-trigger-main">
          <span className="task-job-label">JOB</span>

          <span className={linkedJob ? 'task-job-name' : 'task-job-name empty'}>
            {linkedJob?.name ?? 'Add to a job'}
          </span>
        </span>

        <ChevronIcon size={14} />
      </button>

      {open && (
        <div className="task-job-picker">
          <div className="task-job-picker-head">
            <div>
              <div className="task-job-picker-kicker">
                {linkedJob ? 'Filed under job' : 'Choose a job'}
              </div>

              <div className="task-job-picker-title">
                {linkedJob?.name ?? 'Add this task to a job'}
              </div>
            </div>

            <button
              type="button"
              className="task-job-picker-close"
              onClick={close}
              aria-label="Close job picker"
            >
              ×
            </button>
          </div>

          <div className="task-job-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs"
              aria-label="Search jobs"
              autoComplete="off"
              autoFocus
            />

            {search.length > 0 && (
              <button
                type="button"
                className="task-job-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear job search"
              >
                ×
              </button>
            )}
          </div>

          <div className="task-job-options">
            <button
              type="button"
              className={!linkedJob ? 'task-job-option selected' : 'task-job-option'}
              onClick={() => choose(null)}
            >
              <span className="task-job-option-copy">
                <strong>No job</strong>
                <span>Keep this task independent</span>
              </span>

              {!linkedJob && (
                <span className="task-job-option-check">✓</span>
              )}
            </button>

            {filteredJobs.map((job) => {
              const selected = job.id === jobId;

              return (
                <button
                  type="button"
                  key={job.id}
                  className={
                    selected
                      ? 'task-job-option selected'
                      : 'task-job-option'
                  }
                  onClick={() => choose(job.id)}
                >
                  <span className="task-job-option-copy">
                    <strong>{job.name}</strong>
                    <span>
                      {selected
                        ? 'Current job'
                        : 'File this task here'}
                    </span>
                  </span>

                  {selected && (
                    <span className="task-job-option-check">✓</span>
                  )}
                </button>
              );
            })}

            {filteredJobs.length === 0 && (
              <div className="task-job-empty">
                <strong>No matching jobs</strong>
                <span>
                  Try a different search.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
