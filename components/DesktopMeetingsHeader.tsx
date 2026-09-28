'use client';

import { useMemo, useState } from 'react';

export type MeetingsListFilter = 'upcoming' | 'past' | 'all';

type Props = {
  upcomingCount: number;
  pastCount: number;
  allCount: number;
  filter: MeetingsListFilter;
  onFilterChange: (filter: MeetingsListFilter) => void;
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

export default function DesktopMeetingsHeader({
  upcomingCount,
  pastCount,
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
      {
        key: 'upcoming' as const,
        label: 'Upcoming',
        count: upcomingCount,
      },
      {
        key: 'past' as const,
        label: 'Past',
        count: pastCount,
      },
      {
        key: 'all' as const,
        label: 'All',
        count: allCount,
      },
    ],
    [upcomingCount, pastCount, allCount]
  );

  return (
    <header className="desk-surface-workspace-header">
      <div className="desk-surface-header-main">
        <div className="desk-surface-header-title">
          <span className="desk-surface-header-kicker">Work</span>
          <h1>Meetings</h1>
          <p>
            Conversations captured with their time, people and work context
            intact.
          </p>
        </div>

        <div className="desk-surface-header-summary">
          <div className="desk-surface-stat">
            <span className="desk-surface-stat-value mono">
              {upcomingCount}
            </span>
            <span className="desk-surface-stat-label">upcoming</span>
          </div>

          <div className="desk-surface-stat">
            <span className="desk-surface-stat-value mono">
              {pastCount}
            </span>
            <span className="desk-surface-stat-label">past</span>
          </div>

          <div className="desk-surface-stat">
            <span className="desk-surface-stat-value mono">
              {allCount}
            </span>
            <span className="desk-surface-stat-label">total</span>
          </div>
        </div>

        <div className="desk-surface-header-actions">
          <button
            type="button"
            className="btn btn-steel"
            onClick={onCreate}
          >
            + Record meeting
          </button>
        </div>
      </div>

      <div className="desk-surface-header-controls">
        <div
          className="desk-surface-filter"
          role="group"
          aria-label="Filter meetings"
        >
          {filterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                filter === item.key
                  ? 'desk-surface-filter-btn active'
                  : 'desk-surface-filter-btn'
              }
              aria-pressed={filter === item.key}
              onClick={() => onFilterChange(item.key)}
            >
              {item.label}
              <span className="mono">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="desk-surface-search">
          {searchOpen && (
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search meetings…"
              aria-label="Search meetings"
              autoFocus
            />
          )}

          <button
            type="button"
            className="desk-surface-search-button"
            aria-label={
              searchOpen
                ? 'Close meeting search'
                : 'Search meetings'
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
