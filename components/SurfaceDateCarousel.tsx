'use client';

import { useEffect, useMemo, useState } from 'react';

type SurfaceDateCarouselProps = {
  selectedDate: string | null;
  onChange: (date: string | null) => void;
};

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function SurfaceDateCarousel({
  selectedDate,
  onChange,
}: SurfaceDateCarouselProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const { today, dates } = useMemo(() => {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = localDateKey(base);
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index - 3);
      return {
        key: localDateKey(date),
        weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
        day: String(date.getDate()),
        month: date.toLocaleDateString(undefined, { month: 'short' }),
        today: localDateKey(date) === todayKey,
      };
    });
    return { today: todayKey, dates: days };
  }, []);

  if (!ready) {
    return <div className="surface-date-carousel-wrap" aria-hidden="true" style={{ minHeight: 82 }} />;
  }

  return (
    <div className="surface-date-carousel-wrap">
      <div className="surface-date-carousel" role="tablist" aria-label="Filter by date">
        <button
          type="button"
          role="tab"
          aria-selected={selectedDate === null}
          className={selectedDate === null ? 'surface-date-chip is-active is-all' : 'surface-date-chip is-all'}
          onClick={() => onChange(null)}
        >
          <span className="surface-date-weekday">View</span>
          <span className="surface-date-number">All</span>
        </button>
        {dates.map((date) => {
          const active = selectedDate === date.key;
          return (
            <button
              key={date.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${date.weekday}, ${date.month} ${date.day}${date.today ? ', today' : ''}`}
              className={[
                'surface-date-chip',
                active ? 'is-active' : '',
                date.today ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onChange(date.key)}
            >
              <span className="surface-date-weekday">{date.today ? 'Today' : date.weekday}</span>
              <span className="surface-date-number">{date.day}</span>
              <span className="surface-date-month">{date.month}</span>
            </button>
          );
        })}
      </div>
      {selectedDate && selectedDate !== today ? (
        <button type="button" className="surface-date-return" onClick={() => onChange(today)}>
          Back to today
        </button>
      ) : null}
    </div>
  );
}
