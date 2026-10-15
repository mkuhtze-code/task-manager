// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TripLike } from '@/lib/travel/travelSurface';
import TripObjectLink from '@/components/TripObjectLink';

afterEach(() => cleanup());

const trip: TripLike = {
  id: 'trip-42',
  name: 'Wellington site week',
  start_date: '2026-10-20',
  end_date: '2026-10-23',
};

describe('canonical trip object landmarks', () => {
  it('exposes stable trip identity, route, state, date/stop glance and duration context', () => {
    const { container } = render(
      <TripObjectLink
        trip={trip}
        pressure="soon"
        dateRange="Oct 20 – Oct 23"
        stopCount={3}
        phaseLabel="Tomorrow"
        relativeLine="Starts tomorrow"
        dayCount={4}
      />
    );

    const object = container.querySelector('[data-experience-object="trip"]') as HTMLAnchorElement;
    expect(object).not.toBeNull();
    expect(object.getAttribute('data-object-state')).toBe('upcoming soon');
    expect(object.getAttribute('data-trip-id')).toBe('trip-42');
    expect(object.getAttribute('href')).toBe('/travel/trip-42');
    expect(object.querySelector('[data-experience-part="title"]')?.textContent).toContain('Wellington site week');
    expect(object.querySelector('[data-experience-part="glance"]')?.textContent).toContain('3 stops');
    expect(object.querySelector('[data-experience-part="context"]')?.textContent).toContain('4 days');
    expect(object.getAttribute('aria-label')).toContain('3 stops');
    expect(object.querySelector('[data-experience-part="glance"]')?.getAttribute('title')).toBe('Starts tomorrow');
  });

  it('keeps single-day and no-stop trips concise while retaining the same route', () => {
    const { container } = render(
      <TripObjectLink
        trip={{ ...trip, start_date: '2026-10-20', end_date: '2026-10-20' }}
        pressure="done"
        dateRange="Tue, Oct 20"
        stopCount={null}
        phaseLabel="Past"
        relativeLine="Ended yesterday"
        dayCount={1}
      />
    );

    const object = container.querySelector('[data-experience-object="trip"]') as HTMLAnchorElement;
    expect(object.getAttribute('data-object-state')).toBe('past');
    expect(object.getAttribute('href')).toBe('/travel/trip-42');
    expect(object.textContent).toContain('Wellington site week');
    expect(object.textContent).not.toContain('days');
    expect(object.textContent).not.toContain('stops');
  });
});
