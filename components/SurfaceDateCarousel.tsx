'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const [wheelFocusKey, setWheelFocusKey] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const userGesture = useRef(false);

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

  const focusKey = wheelFocusKey ?? selectedDate ?? today;
  const focusIndex = dates.findIndex((date) => date.key === focusKey);

  const centerDate = useCallback((key: string) => {
    const strip = carouselRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-date-key="${key}"]`);
    if (!strip || !chip) return;
    strip.scrollTo({
      left: chip.offsetLeft + chip.offsetWidth / 2 - strip.clientWidth / 2,
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    centerDate(selectedDate ?? today);
  }, [centerDate, ready, selectedDate, today]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  const vibrate = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
    } catch {
      // Haptics are optional; selection still works when vibration is unavailable.
    }
  }, []);

  const handleScroll = useCallback(() => {
    const strip = carouselRef.current;
    if (!strip) return;
    const stripCenter = strip.getBoundingClientRect().left + strip.clientWidth / 2;
    let closest: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    strip.querySelectorAll<HTMLElement>('[data-date-key]').forEach((chip) => {
      const rect = chip.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - stripCenter);
      if (distance < closestDistance) {
        closest = chip;
        closestDistance = distance;
      }
    });
    if (!closest) return;
    const nextKey = closest.dataset.dateKey ?? null;
    if (nextKey) setWheelFocusKey(nextKey);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (userGesture.current && nextKey && nextKey !== selectedDate) {
        onChange(nextKey === 'all' ? null : nextKey);
        vibrate();
      }
      userGesture.current = false;
    }, 130);
  }, [onChange, selectedDate, vibrate]);

  const chooseDate = useCallback((key: string | null) => {
    userGesture.current = false;
    onChange(key);
    setWheelFocusKey(key ?? today);
    vibrate();
  }, [onChange, today, vibrate]);

  if (!ready) {
    return <div className="surface-date-carousel-wrap" aria-hidden="true" style={{ minHeight: 82 }} />;
  }

  return (
    <div className="surface-date-carousel-wrap" data-no-surface-swipe data-horizontal-scroll>
      <div
        ref={carouselRef}
        className="surface-date-carousel"
        role="tablist"
        aria-label="Filter by date"
        onScroll={handleScroll}
        onPointerDown={() => { userGesture.current = true; }}
        onTouchStart={(event) => { userGesture.current = true; event.stopPropagation(); }}
        onTouchEnd={(event) => event.stopPropagation()}
        onTouchCancel={(event) => { userGesture.current = false; event.stopPropagation(); }}
      >
        <button
          type="button"
          role="tab"
          data-date-key="all"
          aria-selected={selectedDate === null}
          className={selectedDate === null ? 'surface-date-chip is-active is-all' : 'surface-date-chip is-all'}
          onClick={() => chooseDate(null)}
        >
          <span className="surface-date-weekday">View</span>
          <span className="surface-date-number">All</span>
        </button>
        {dates.map((date, index) => {
          const active = selectedDate === date.key;
          const offset = index - focusIndex;
          const distance = Math.abs(offset);
          const rotation = Math.max(-24, Math.min(24, offset * 7));
          const scale = Math.max(0.76, 1 - distance * 0.075);
          const lift = Math.min(distance, 3) * 2;
          return (
            <button
              key={date.key}
              data-date-key={date.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${date.weekday}, ${date.month} ${date.day}${date.today ? ', today' : ''}`}
              className={[
                'surface-date-chip',
                active ? 'is-active' : '',
                date.today ? 'is-today' : '',
                focusKey === date.key ? 'is-wheel-center' : '',
              ].filter(Boolean).join(' ')}
              style={{
                transform: `perspective(520px) rotateY(${rotation}deg) scale(${scale}) translateY(${lift}px)`,
                zIndex: 10 - distance,
              }}
              onClick={() => chooseDate(date.key)}
            >
              <span className="surface-date-weekday">{date.today ? 'Today' : date.weekday}</span>
              <span className="surface-date-number">{date.day}</span>
              <span className="surface-date-month">{date.month}</span>
            </button>
          );
        })}
      </div>
      {selectedDate && selectedDate !== today ? (
        <button type="button" className="surface-date-return" onClick={() => chooseDate(today)}>
          Back to today
        </button>
      ) : null}
    </div>
  );
}
