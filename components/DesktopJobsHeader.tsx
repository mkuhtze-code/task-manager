'use client';

import { PlusIcon } from '@/components/icons';

export type JobsListFilter =
  | 'open'
  | 'done'
  | 'all';

type Props = {
  total: number;
  openCount: number;
  doneCount: number;
  filter: JobsListFilter;
  onFilterChange: (
    filter: JobsListFilter
  ) => void;
  onCreate: () => void;
  disabled?: boolean;
};

/**
 * Desktop Jobs workstation header.
 *
 * This is operational context, not business analytics.
 *
 * It answers:
 *   - How much work is here?
 *   - What am I currently looking at?
 *   - What can I do next?
 *
 * It deliberately avoids:
 *   - revenue dashboards
 *   - productivity scores
 *   - efficiency scores
 *   - KPI walls
 *   - gamification
 */
export default function DesktopJobsHeader({
  total,
  openCount,
  doneCount,
  filter,
  onFilterChange,
  onCreate,
  disabled = false,
}: Props) {
  const visibleCount =
    filter === 'open'
      ? openCount
      : filter === 'done'
        ? doneCount
        : total;

  return (
    <section
      className="desk-jobs-header"
      aria-label="Jobs overview"
    >
      <div className="desk-jobs-header-main">
        <div className="desk-jobs-header-title">
          <span className="desk-jobs-header-kicker">
            Jobs
          </span>

          <h1>
            Work that spans days
          </h1>

          <p>
            Keep the work, context and progress
            together until the job is finished.
          </p>
        </div>

        <div className="desk-jobs-header-summary">
          <div className="desk-jobs-stat">
            <span className="desk-jobs-stat-value mono">
              {openCount}
            </span>

            <span className="desk-jobs-stat-label">
              open
            </span>
          </div>

          <div className="desk-jobs-stat">
            <span className="desk-jobs-stat-value mono">
              {doneCount}
            </span>

            <span className="desk-jobs-stat-label">
              done
            </span>
          </div>

          <div className="desk-jobs-stat desk-jobs-stat-current">
            <span className="desk-jobs-stat-value mono">
              {visibleCount}
            </span>

            <span className="desk-jobs-stat-label">
              showing
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-steel desk-jobs-create"
          onClick={onCreate}
          disabled={disabled}
        >
          <PlusIcon size={15} />
          New job
        </button>
      </div>

      <div className="desk-jobs-header-controls">
        <div
          className="desk-jobs-filter"
          role="group"
          aria-label="Job filter"
        >
          <button
            type="button"
            className={
              filter === 'open'
                ? 'desk-jobs-filter-btn active'
                : 'desk-jobs-filter-btn'
            }
            aria-pressed={
              filter === 'open'
            }
            onClick={() =>
              onFilterChange('open')
            }
          >
            Open
            <span>{openCount}</span>
          </button>

          <button
            type="button"
            className={
              filter === 'done'
                ? 'desk-jobs-filter-btn active'
                : 'desk-jobs-filter-btn'
            }
            aria-pressed={
              filter === 'done'
            }
            onClick={() =>
              onFilterChange('done')
            }
          >
            Done
            <span>{doneCount}</span>
          </button>

          <button
            type="button"
            className={
              filter === 'all'
                ? 'desk-jobs-filter-btn active'
                : 'desk-jobs-filter-btn'
            }
            aria-pressed={
              filter === 'all'
            }
            onClick={() =>
              onFilterChange('all')
            }
          >
            All
            <span>{total}</span>
          </button>
        </div>

        <span className="desk-jobs-header-note">
          Select a job to continue working with
          its tasks and context.
        </span>
      </div>
    </section>
  );
}
