'use client';

import { fmtClock } from '@/lib/timeFormat';

type Commitment = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  href?: string;
  kind?: 'meeting' | 'calendar';
  jobLabel?: string | null;
};

function durationLabel(commitment: Commitment): string {
  if (commitment.all_day) return 'All day';
  const minutes = Math.max(
    0,
    Math.round((new Date(commitment.end_at).getTime() - new Date(commitment.start_at).getTime()) / 60000),
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0
    ? remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
    : `${minutes}m`;
}

/** Visible, chronological fixed commitments. Values come from the existing Today selector. */
export function TodayFixedCommitments({ commitments }: { commitments: Commitment[] }) {
  const ordered = [...commitments].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });

  if (ordered.length === 0) return null;

  return (
    <section className="today-fixed-commitments" aria-labelledby="today-fixed-commitments-title" data-testid="today-fixed-commitments">
      <div className="today-fixed-commitments__heading">
        <h2 id="today-fixed-commitments-title">Fixed commitments</h2>
        <span>{ordered.length}</span>
      </div>
      <ol>
        {ordered.map((commitment) => {
          const start = new Date(commitment.start_at);
          const time = commitment.all_day
            ? 'All day'
            : fmtClock(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
          const duration = durationLabel(commitment);
          const content = (
            <>
              <time dateTime={commitment.start_at}>{time}</time>
              <span className="today-fixed-commitments__title">{commitment.title}</span>
              <span className="today-fixed-commitments__duration">{duration}</span>
            </>
          );
          return (
            <li key={commitment.id}>
              {commitment.href ? <a href={commitment.href}>{content}</a> : <div>{content}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
