'use client';

import { useMemo, useState } from 'react';

export type JobsListFilter = 'open' | 'done' | 'all';

type Props = {
  openCount: number;
  doneCount: number;
  allCount: number;
  /** Jobs with open tasks due today or marked active on Today. */
  activeTodayCount?: number;
  /** Open jobs with zero recent task progress (optional signal). */
  attentionCount?: number;
  /** Spotlight job name when one is clearly active. */
  spotlightJobName?: string | null;
  filter: JobsListFilter;
  onFilterChange: (filter: JobsListFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
};

function SearchGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export default function DesktopJobsHeader({
  openCount,
  doneCount,
  allCount,
  activeTodayCount = 0,
  attentionCount = 0,
  spotlightJobName = null,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onCreate,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(search.length > 0);
  const [depthOpen, setDepthOpen] = useState(false);

  const filterItems = useMemo(
    () => [
      { key: 'open' as const, label: 'Open', count: openCount },
      { key: 'done' as const, label: 'Done', count: doneCount },
      { key: 'all' as const, label: 'All', count: allCount },
    ],
    [openCount, doneCount, allCount]
  );

  const pulseTitle =
    activeTodayCount > 0
      ? `${activeTodayCount} active today`
      : openCount > 0
        ? `${openCount} open`
        : 'No open work';

  const pulseClass =
    attentionCount > 0
      ? 'surface-pulse is-attention'
      : openCount === 0
        ? 'surface-pulse is-clear'
        : 'surface-pulse';

  const workRead =
    activeTodayCount > 0
      ? 'Work is moving on live jobs today.'
      : attentionCount > 0
        ? 'Some jobs need a look — nothing is moving them.'
        : openCount > 0
          ? 'Open work is waiting for the next move.'
          : 'No open jobs — capture work when it appears.';

  return (
    <header className="surface-header desk-jobs-workspace-header">
      <div className="surface-header-bar">
        <div className="surface-header-orient">
          <div className="surface-identity">
            <span className="surface-kicker">Work / Field</span>
            <h1 className="surface-title">Jobs</h1>
          </div>
          <div className={pulseClass} aria-label="Jobs pulse">
          <div className="surface-pulse-body">
            <span className="surface-pulse-title">{pulseTitle}</span>
          </div>
        </div>
        </div>

        <div className="surface-header-actions">
          <button type="button" className="btn btn-steel" onClick={onCreate}>
            + New job
          </button>
          <button
            type="button"
            className={
              depthOpen
                ? 'detail-pill surface-depth-toggle is-on'
                : 'detail-pill surface-depth-toggle'
            }
            aria-expanded={depthOpen}
            onClick={() => setDepthOpen((v) => !v)}
          >
            {depthOpen ? 'Hide context' : 'Work context'}
          </button>
        </div>
      </div>

      <div className="surface-header-controls">
        <div className="surface-filter" role="group" aria-label="Filter jobs">
          {filterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                filter === item.key
                  ? 'surface-filter-btn active'
                  : 'surface-filter-btn'
              }
              aria-pressed={filter === item.key}
              onClick={() => onFilterChange(item.key)}
            >
              {item.label}
              <span className="mono">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="surface-search">
          {searchOpen ? (
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search jobs…"
              aria-label="Search jobs"
              autoFocus
            />
          ) : null}
          <button
            type="button"
            className="surface-search-button"
            aria-label={searchOpen ? 'Close job search' : 'Search jobs'}
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen && search.length > 0) onSearchChange('');
              setSearchOpen((v) => !v);
            }}
          >
            <SearchGlyph />
          </button>
        </div>
      </div>

      {depthOpen ? (
        <div className="surface-depth" aria-label="Work context">
          <p className="surface-depth-read">{workRead}</p>
          <div className="surface-depth-band">
            <section>
              <h3 className="surface-depth-col-title">Landscape</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Open</dt>
                  <dd className="mono">{openCount}</dd>
                </div>
                <div>
                  <dt>Active today</dt>
                  <dd className="mono">{activeTodayCount}</dd>
                </div>
                {attentionCount > 0 ? (
                  <div>
                    <dt>Need attention</dt>
                    <dd className="mono">{attentionCount}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Done</dt>
                  <dd className="mono">{doneCount}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="surface-depth-col-title">Focus</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Spotlight</dt>
                  <dd>{spotlightJobName || 'None singled out'}</dd>
                </div>
                <div>
                  <dt>View</dt>
                  <dd>
                    {filter === 'open'
                      ? 'Open jobs'
                      : filter === 'done'
                        ? 'Completed jobs'
                        : 'All jobs'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </header>
  );
}
