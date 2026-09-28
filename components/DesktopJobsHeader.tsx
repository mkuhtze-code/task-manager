'use client';

import { useMemo, useState } from 'react';

export type JobsListFilter = 'open' | 'done' | 'all';

type Props = {
  openCount: number;
  doneCount: number;
  allCount: number;
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
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onCreate,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(search.length > 0);

  const filterItems = useMemo(
    () => [
      { key: 'open' as const, label: 'Open', count: openCount },
      { key: 'done' as const, label: 'Done', count: doneCount },
      { key: 'all' as const, label: 'All', count: allCount },
    ],
    [openCount, doneCount, allCount]
  );

  return (
    <header className="desk-jobs-workspace-header">
      <div className="desk-jobs-header-main">
        <div className="desk-jobs-header-title">
          <span className="desk-jobs-header-kicker">Work</span>

          <h1>Jobs</h1>

          <p>
            Work that spans days, with its tasks, evidence and context gathered
            together.
          </p>
        </div>

        <div
          className="desk-jobs-header-summary"
          aria-label="Job summary"
        >
          <div className="desk-jobs-stat">
            <span className="desk-jobs-stat-value mono">
              {openCount}
            </span>
            <span className="desk-jobs-stat-label">open</span>
          </div>

          <div className="desk-jobs-stat">
            <span className="desk-jobs-stat-value mono">
              {doneCount}
            </span>
            <span className="desk-jobs-stat-label">done</span>
          </div>

          <div className="desk-jobs-stat">
            <span className="desk-jobs-stat-value mono">
              {allCount}
            </span>
            <span className="desk-jobs-stat-label">total</span>
          </div>
        </div>

        <div className="desk-jobs-header-actions">
          <button
            type="button"
            className="btn btn-steel desk-jobs-create"
            onClick={onCreate}
          >
            + New job
          </button>
        </div>
      </div>

      <div className="desk-jobs-header-controls">
        <div
          className="desk-jobs-filter"
          role="group"
          aria-label="Filter jobs"
        >
          {filterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                filter === item.key
                  ? 'desk-jobs-filter-btn active'
                  : 'desk-jobs-filter-btn'
              }
              aria-pressed={filter === item.key}
              onClick={() => onFilterChange(item.key)}
            >
              {item.label}
              <span className="mono">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="desk-jobs-search">
          {searchOpen && (
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search jobs…"
              aria-label="Search jobs"
              autoFocus
            />
          )}

          <button
            type="button"
            className="desk-jobs-search-button"
            aria-label={
              searchOpen ? 'Close job search' : 'Search jobs'
            }
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen && search.length > 0) {
                onSearchChange('');
              }

              setSearchOpen((value) => !value);
            }}
          >
            <SearchGlyph />
          </button>
        </div>
      </div>
    </header>
  );
}
