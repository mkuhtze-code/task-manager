'use client';

import { useMemo, useState } from 'react';

export type TravelListFilter = 'active' | 'upcoming' | 'past' | 'all';

type Props = {
  activeCount: number;
  upcomingCount: number;
  pastCount: number;
  allCount: number;
  filter: TravelListFilter;
  onFilterChange: (filter: TravelListFilter) => void;
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

export default function DesktopTravelHeader({
  activeCount,
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
        key: 'active' as const,
        label: 'Active',
        count: activeCount,
      },
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
    [activeCount, upcomingCount, pastCount, allCount]
  );

  return (
    <header className="desk-surface-workspace-header">
      <div className="desk-surface-header-main">
        <div className="desk-surface-header-title">
          <span className="desk-surface-header-kicker">Plan</span>
          <h1>Travel</h1>
          <p>
            Trips, days and stops held together so the plan stays grounded in
            what actually fits.
          </p>
        </div>

        <div className="desk-surface-header-summary">
          <div className="desk-surface-stat">
            <span className="desk-surface-stat-value mono">
              {activeCount}
            </span>
            <span className="desk-surface-stat-label">active</span>
          </div>

          <div className="desk-surface-stat">
            <span className="desk-surface-stat-value mono">
              {upcomingCount}
            </span>
            <span className="desk-surface-stat-label">upcoming</span>
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
            + New trip
          </button>
        </div>
      </div>

      <div className="desk-surface-header-controls">
        <div
          className="desk-surface-filter"
          role="group"
          aria-label="Filter trips"
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
              placeholder="Search trips…"
              aria-label="Search trips"
              autoFocus
            />
          )}

          <button
            type="button"
            className="desk-surface-search-button"
            aria-label={
              searchOpen ? 'Close trip search' : 'Search trips'
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
