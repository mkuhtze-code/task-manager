'use client';

import { useMemo, useState } from 'react';

export type TravelListFilter = 'active' | 'upcoming' | 'past' | 'all';

type Props = {
  activeCount: number;
  upcomingCount: number;
  pastCount: number;
  allCount: number;
  /** Next or active trip name. */
  focusTripName?: string | null;
  /** Human date for next movement. */
  focusWhen?: string | null;
  /** Stop count on focus trip when known. */
  focusStops?: number | null;
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
  focusTripName = null,
  focusWhen = null,
  focusStops = null,
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
      { key: 'active' as const, label: 'Active', count: activeCount },
      { key: 'upcoming' as const, label: 'Upcoming', count: upcomingCount },
      { key: 'past' as const, label: 'Past', count: pastCount },
      { key: 'all' as const, label: 'All', count: allCount },
    ],
    [activeCount, upcomingCount, pastCount, allCount]
  );

  const pulseTitle =
    activeCount > 0
      ? `${activeCount} active`
      : focusTripName
        ? 'Next trip'
        : upcomingCount > 0
          ? `${upcomingCount} upcoming`
          : 'No trips planned';

  const pulseMeta = [
    focusTripName,
    focusWhen,
    focusStops != null && focusStops > 0 ? `${focusStops} stops` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const contextBits: string[] = [];
  if (activeCount > 0) contextBits.push(`${activeCount} active`);
  if (upcomingCount > 0) contextBits.push(`${upcomingCount} upcoming`);
  if (focusTripName) contextBits.push(focusTripName);
  if (focusWhen) contextBits.push(focusWhen);

  const travelRead =
    activeCount > 0
      ? 'A trip is in motion — stops and days stay grounded in the plan.'
      : focusTripName
        ? 'Next movement is set. Check stops before the day fills up.'
        : upcomingCount > 0
          ? 'Upcoming trips are planned. Travel time shapes what fits on Today.'
          : 'No trips yet — plan movement when the work needs it.';

  return (
    <header className="surface-header desk-surface-workspace-header">
      <div className="surface-header-bar">
        <div className="surface-header-orient">
          <div className="surface-identity">
            <span className="surface-kicker">Movement</span>
            <h1 className="surface-title">Travel</h1>
          </div>
          <div className="surface-pulse" aria-label="Travel pulse">
            <div className="surface-pulse-body">
              <span className="surface-pulse-title">{pulseTitle}</span>
              <span className="surface-pulse-meta">
                {pulseMeta || 'Trips and stops held to what actually fits'}
              </span>
            </div>
          </div>
        </div>

        <div className="surface-context" aria-label="Travel context">
          {contextBits.map((bit, i) => (
            <span key={`${i}-${bit}`} className="surface-context-bit">
              {i > 0 ? <span className="surface-context-dot">·</span> : null}
              {bit}
            </span>
          ))}
        </div>

        <div className="surface-header-actions">
          <button type="button" className="btn btn-steel" onClick={onCreate}>
            + New trip
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
            {depthOpen ? 'Hide context' : 'Trip context'}
          </button>
        </div>
      </div>

      <div className="surface-header-controls">
        <div className="surface-filter" role="group" aria-label="Filter trips">
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
              placeholder="Search trips…"
              aria-label="Search trips"
              autoFocus
            />
          ) : null}
          <button
            type="button"
            className="surface-search-button"
            aria-label={searchOpen ? 'Close trip search' : 'Search trips'}
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
        <div className="surface-depth" aria-label="Trip context">
          <p className="surface-depth-read">{travelRead}</p>
          <div className="surface-depth-band">
            <section>
              <h3 className="surface-depth-col-title">Movement</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Active</dt>
                  <dd className="mono">{activeCount}</dd>
                </div>
                <div>
                  <dt>Upcoming</dt>
                  <dd className="mono">{upcomingCount}</dd>
                </div>
                <div>
                  <dt>Past</dt>
                  <dd className="mono">{pastCount}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="surface-depth-col-title">Focus</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Trip</dt>
                  <dd>{focusTripName || 'None selected'}</dd>
                </div>
                {focusWhen ? (
                  <div>
                    <dt>When</dt>
                    <dd>{focusWhen}</dd>
                  </div>
                ) : null}
                {focusStops != null && focusStops > 0 ? (
                  <div>
                    <dt>Stops</dt>
                    <dd className="mono">{focusStops}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </header>
  );
}
