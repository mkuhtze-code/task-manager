'use client';

/**
 * Desktop Travel command header — Maybach craft.
 * Pulse = movement state now. Depth = regime + what travel does to the day.
 */

import { useState } from 'react';
import Link from 'next/link';
import GearMenu from '@/components/GearMenu';

export type TravelListFilter = 'active' | 'upcoming' | 'past' | 'all';

type Props = {
  pulseTitle: string;
  pulseMeta: string;
  pulseAttention?: boolean;
  depthRead: string;
  consequenceLine?: string | null;
  activeCount: number;
  upcomingCount: number;
  pastCount: number;
  allCount: number;
  nextRelative?: string | null;
  nextTripId?: string | null;
  featuredTitle?: string | null;
  featuredPhase?: string | null;
  featuredRelative?: string | null;
  filter: TravelListFilter;
  onFilterChange: (filter: TravelListFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
};

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function DesktopTravelHeader({
  pulseTitle,
  pulseMeta,
  pulseAttention = false,
  depthRead,
  consequenceLine = null,
  activeCount,
  upcomingCount,
  pastCount,
  allCount,
  nextRelative = null,
  nextTripId = null,
  featuredTitle = null,
  featuredPhase = null,
  featuredRelative = null,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onCreate,
}: Props) {
  const [depthOpen, setDepthOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(search.length > 0);

  const filters: {
    key: TravelListFilter;
    label: string;
    count: number;
  }[] = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'upcoming', label: 'Ahead', count: upcomingCount },
    { key: 'past', label: 'Past', count: pastCount },
    { key: 'all', label: 'All', count: allCount },
  ];

  const showFeatured =
    Boolean(featuredTitle && nextTripId) &&
    (pulseAttention ||
      featuredPhase === 'In motion' ||
      featuredPhase === 'Final day' ||
      featuredPhase === 'Tomorrow' ||
      featuredPhase === 'Starts today');

  return (
    <header className="surface-header desk-surface-workspace-header travel-maybach-header">
      <div className="surface-header-bar">
        <div className="surface-header-orient">
          <div className="surface-identity">
            <span className="surface-kicker">Place</span>
            <h1 className="surface-title">Travel</h1>
          </div>
          <div
            className={
              pulseAttention ? 'surface-pulse is-attention' : 'surface-pulse'
            }
            aria-label="Travel pulse"
          >
            <div className="surface-pulse-body">
              <span className="surface-pulse-title">{pulseTitle}</span>
              <span className="surface-pulse-meta">{pulseMeta}</span>
            </div>
          </div>
        </div>

        <div className="surface-context" aria-label="Travel context">
          {activeCount > 0 ? (
            <span className="surface-context-bit">
              <span className="surface-context-emphasis">
                {activeCount} active
              </span>
            </span>
          ) : (
            <span className="surface-context-bit surface-context-quiet">
              Nothing in motion
            </span>
          )}
          {nextRelative ? (
            <span className="surface-context-bit">
              <span className="surface-context-dot">·</span>
              <span className="surface-context-next">{nextRelative}</span>
            </span>
          ) : null}
          {upcomingCount > 0 && activeCount === 0 ? (
            <span className="surface-context-bit">
              <span className="surface-context-dot">·</span>
              {upcomingCount} ahead
            </span>
          ) : null}
        </div>

        <div className="surface-header-actions">
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
          <button
            type="button"
            className="btn btn-steel surface-primary-action"
            onClick={onCreate}
          >
            Plan trip
          </button>
          <GearMenu />
        </div>
      </div>

      {showFeatured && nextTripId ? (
        <Link
          href={`/travel/${nextTripId}`}
          className="travel-featured"
          aria-label={`Open ${featuredTitle}`}
        >
          <div className="travel-featured-label">
            {featuredPhase === 'In motion' || featuredPhase === 'Final day'
              ? 'Now'
              : 'Next'}
          </div>
          <div className="travel-featured-body">
            <span className="travel-featured-title">{featuredTitle}</span>
            <span className="travel-featured-meta">
              {[featuredPhase, featuredRelative].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span className="travel-featured-cta" aria-hidden>
            Open
          </span>
        </Link>
      ) : null}

      <div className="surface-controls">
        <div
          className="surface-filters"
          role="tablist"
          aria-label="Travel filters"
        >
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={
                filter === item.key
                  ? 'surface-filter is-active'
                  : 'surface-filter'
              }
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
        <div className="surface-depth travel-depth" aria-label="Trip context">
          <p className="surface-depth-read">{depthRead}</p>
          {consequenceLine ? (
            <p className="travel-consequence">{consequenceLine}</p>
          ) : null}
          <div className="surface-depth-band">
            <section>
              <h3 className="surface-depth-col-title">Regime</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Active</dt>
                  <dd className="mono">{activeCount}</dd>
                </div>
                <div>
                  <dt>Ahead</dt>
                  <dd className="mono">{upcomingCount}</dd>
                </div>
                <div>
                  <dt>Past</dt>
                  <dd className="mono">{pastCount}</dd>
                </div>
                <div>
                  <dt>All</dt>
                  <dd className="mono">{allCount}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="surface-depth-col-title">Focus</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Trip</dt>
                  <dd>{featuredTitle || 'None'}</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{featuredRelative || nextRelative || '—'}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </header>
  );
}
