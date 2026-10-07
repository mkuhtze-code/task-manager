'use client';

/**
 * Desktop Meetings command header — Maybach craft.
 * Pulse = conversation state now. Depth = schedule + what meetings leave behind.
 * Same visual grammar as Today; domain is conversation → consequence.
 */

import { useState } from 'react';
import Link from 'next/link';
import GearMenu from '@/components/GearMenu';

export type MeetingsListFilter = 'all' | 'upcoming' | 'past';

type Props = {
  pulseTitle: string;
  pulseMeta: string;
  pulseAttention?: boolean;
  depthRead: string;
  consequenceLine?: string | null;
  todayCount: number;
  upcomingCount: number;
  pastCount: number;
  todayLoadMins: number;
  openLoopCount: number;
  nextLabel: string | null;
  nextRelative?: string | null;
  nextMeetingId?: string | null;
  featuredTitle?: string | null;
  featuredPhase?: string | null;
  listFilter: MeetingsListFilter;
  onListFilter: (f: MeetingsListFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onNewMeeting: () => void;
  filterCounts: { all: number; upcoming: number; past: number };
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

function fmtDur(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function DesktopMeetingsHeader({
  pulseTitle,
  pulseMeta,
  pulseAttention = false,
  depthRead,
  consequenceLine = null,
  todayCount,
  upcomingCount,
  pastCount,
  todayLoadMins,
  openLoopCount,
  nextLabel,
  nextRelative = null,
  nextMeetingId = null,
  featuredTitle = null,
  featuredPhase = null,
  listFilter,
  onListFilter,
  search,
  onSearchChange,
  onNewMeeting,
  filterCounts,
}: Props) {
  const [depthOpen, setDepthOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const filters: { key: MeetingsListFilter; label: string; count: number }[] =
    [
      { key: 'all', label: 'All', count: filterCounts.all },
      { key: 'upcoming', label: 'Ahead', count: filterCounts.upcoming },
      { key: 'past', label: 'Past', count: filterCounts.past },
    ];

  const showFeatured = Boolean(featuredTitle && nextMeetingId);

  return (
    <header className="surface-header desk-meetings-workspace-header meetings-maybach-header">
      <div className="surface-header-bar">
        <div className="surface-header-orient">
          <div className="surface-identity">
            <span className="surface-kicker">People</span>
            <h1 className="surface-title">Meetings</h1>
          </div>
          <div
            className={
              pulseAttention
                ? 'surface-pulse is-attention'
                : 'surface-pulse'
            }
            aria-label="Meetings pulse"
          >
            <div className="surface-pulse-body">
              <span className="surface-pulse-title">{pulseTitle}</span>
              <span className="surface-pulse-meta">{pulseMeta}</span>
            </div>
          </div>
        </div>

        <div className="surface-context" aria-label="Meetings context">
          {todayCount > 0 ? (
            <span className="surface-context-bit">
              <span className="surface-context-emphasis mono">
                {fmtDur(todayLoadMins)}
              </span>{' '}
              today
            </span>
          ) : (
            <span className="surface-context-bit surface-context-quiet">
              Clear today
            </span>
          )}
          {nextRelative ? (
            <span className="surface-context-bit">
              <span className="surface-context-dot">·</span>
              <span className="surface-context-next">{nextRelative}</span>
            </span>
          ) : nextLabel ? (
            <span className="surface-context-bit">
              <span className="surface-context-dot">·</span>
              <span className="surface-context-next">{nextLabel}</span>
            </span>
          ) : null}
          {openLoopCount > 0 ? (
            <span className="surface-context-bit">
              <span className="surface-context-dot">·</span>
              {openLoopCount} open loop{openLoopCount === 1 ? '' : 's'}
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
            {depthOpen ? 'Hide context' : 'Meeting context'}
          </button>
          <button
            type="button"
            className="btn btn-steel surface-primary-action"
            onClick={onNewMeeting}
          >
            Record
          </button>
          <GearMenu />
        </div>
      </div>

      {showFeatured && nextMeetingId ? (
        <Link
          href={`/meetings/${nextMeetingId}`}
          className="meetings-featured surface-object surface-object-featured"
          aria-label={`Open ${featuredTitle}`}
        >
          <div className="meetings-featured-label">
            {featuredPhase === 'Happening' ? 'Now' : 'Next'}
          </div>
          <div className="meetings-featured-body">
            <span className="meetings-featured-title">{featuredTitle}</span>
            <span className="meetings-featured-meta">
              {[featuredPhase, nextRelative].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span className="meetings-featured-cta" aria-hidden>
            Open
          </span>
        </Link>
      ) : null}

      <div className="surface-controls">
        <div
          className="surface-filters"
          role="tablist"
          aria-label="Meeting filters"
        >
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={listFilter === item.key}
              className={
                listFilter === item.key
                  ? 'surface-filter is-active'
                  : 'surface-filter'
              }
              onClick={() => onListFilter(item.key)}
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
              placeholder="Search conversations…"
              aria-label="Search meetings"
              autoFocus
            />
          ) : null}
          <button
            type="button"
            className="surface-search-button"
            aria-label={
              searchOpen ? 'Close meeting search' : 'Search meetings'
            }
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
        <div className="surface-depth meetings-depth" aria-label="Meeting context">
          <p className="surface-depth-read">{depthRead}</p>
          {consequenceLine ? (
            <p className="meetings-consequence">{consequenceLine}</p>
          ) : null}
          <div className="surface-depth-band">
            <section>
              <h3 className="surface-depth-col-title">On the clock</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Today</dt>
                  <dd className="mono">{todayCount}</dd>
                </div>
                <div>
                  <dt>Load</dt>
                  <dd className="mono">{fmtDur(todayLoadMins)}</dd>
                </div>
                <div>
                  <dt>Ahead</dt>
                  <dd className="mono">{upcomingCount}</dd>
                </div>
                <div>
                  <dt>Past</dt>
                  <dd className="mono">{pastCount}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="surface-depth-col-title">What it leaves</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Next</dt>
                  <dd>{nextLabel || 'Nothing scheduled'}</dd>
                </div>
                <div>
                  <dt>Open loops</dt>
                  <dd className="mono">
                    {openLoopCount > 0
                      ? `${openLoopCount} still open`
                      : 'None flagged'}
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
