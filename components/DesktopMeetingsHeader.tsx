'use client';

import { useMemo, useState } from 'react';

export type MeetingsListFilter = 'upcoming' | 'past' | 'all';

type Props = {
  upcomingCount: number;
  pastCount: number;
  allCount: number;
  /** Meetings whose start is today (local). */
  todayCount?: number;
  /** Next meeting label e.g. "11:30 Site walk". */
  nextLabel?: string | null;
  /** Outstanding follow-up count if known. */
  followUpCount?: number;
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
  todayCount = 0,
  nextLabel = null,
  followUpCount = 0,
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
      { key: 'upcoming' as const, label: 'Upcoming', count: upcomingCount },
      { key: 'past' as const, label: 'Past', count: pastCount },
      { key: 'all' as const, label: 'All', count: allCount },
    ],
    [upcomingCount, pastCount, allCount]
  );

  const pulseTitle =
    todayCount > 0
      ? `${todayCount} today`
      : nextLabel
        ? 'Next up'
        : upcomingCount > 0
          ? `${upcomingCount} upcoming`
          : 'No meetings ahead';

  const pulseMeta = [
    nextLabel,
    followUpCount > 0 ? `${followUpCount} follow-up` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const contextBits: string[] = [];
  if (todayCount > 0) contextBits.push(`${todayCount} today`);
  if (upcomingCount > 0) contextBits.push(`${upcomingCount} upcoming`);
  if (nextLabel) contextBits.push(nextLabel);
  if (followUpCount > 0) contextBits.push(`${followUpCount} follow-up`);

  const meetingRead =
    todayCount > 0
      ? 'Conversations on the calendar today — capture what they leave behind.'
      : nextLabel
        ? 'Something is coming up. Keep the thread connected to the work.'
        : upcomingCount > 0
          ? 'Upcoming meetings are set. Follow-ups land back in Jobs and Today.'
          : 'No meetings ahead — log one when a conversation shapes the work.';

  return (
    <header className="surface-header desk-meetings-workspace-header">
      <div className="surface-header-bar">
        <div className="surface-header-orient">
          <div className="surface-identity">
            <span className="surface-kicker">Conversations</span>
            <h1 className="surface-title">Meetings</h1>
          </div>
          <div className="surface-pulse" aria-label="Meetings pulse">
            <div className="surface-pulse-body">
              <span className="surface-pulse-title">{pulseTitle}</span>
              <span className="surface-pulse-meta">
                {pulseMeta || 'What was said, and what it leaves behind'}
              </span>
            </div>
          </div>
        </div>

        <div className="surface-context" aria-label="Meetings context">
          {contextBits.map((bit, i) => (
            <span key={`${i}-${bit}`} className="surface-context-bit">
              {i > 0 ? <span className="surface-context-dot">·</span> : null}
              {bit}
            </span>
          ))}
        </div>

        <div className="surface-header-actions">
          <button type="button" className="btn btn-steel" onClick={onCreate}>
            + New meeting
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
            {depthOpen ? 'Hide context' : 'Meeting context'}
          </button>
        </div>
      </div>

      <div className="surface-header-controls">
        <div
          className="surface-filter"
          role="group"
          aria-label="Filter meetings"
        >
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
              placeholder="Search meetings…"
              aria-label="Search meetings"
              autoFocus
            />
          ) : null}
          <button
            type="button"
            className="surface-search-button"
            aria-label={searchOpen ? 'Close meeting search' : 'Search meetings'}
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
        <div className="surface-depth" aria-label="Meeting context">
          <p className="surface-depth-read">{meetingRead}</p>
          <div className="surface-depth-band">
            <section>
              <h3 className="surface-depth-col-title">Schedule</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Today</dt>
                  <dd className="mono">{todayCount}</dd>
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
              <h3 className="surface-depth-col-title">Thread</h3>
              <dl className="surface-depth-dl">
                <div>
                  <dt>Next</dt>
                  <dd>{nextLabel || 'Nothing scheduled'}</dd>
                </div>
                {followUpCount > 0 ? (
                  <div>
                    <dt>Follow-up</dt>
                    <dd className="mono">{followUpCount}</dd>
                  </div>
                ) : (
                  <div>
                    <dt>Follow-up</dt>
                    <dd>None flagged</dd>
                  </div>
                )}
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </header>
  );
}
