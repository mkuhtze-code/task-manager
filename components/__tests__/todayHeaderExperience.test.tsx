// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodayHeader } from '@/components/TodayHeader';

vi.mock('@/components/GearMenu', () => ({ default: () => <button type="button">Settings</button> }));

function renderMobileTodayHeader() {
  const props = {
    overloaded: false,
    weekdayLabel: 'Thursday',
    dateOnlyLabel: 'Oct 15',
    isWorkDay: true,
    minutesLeftToday: 240,
    remainingWorkMins: 180,
    nowPercent: 0.5,
    planWidthPercent: 0.25,
    workStart: '08:00',
    workEnd: '16:00',
    geoAware: false,
    recalculatingRoute: false,
    currentBaseLabel: null,
    onRecalcRoute: vi.fn(),
    routeError: null,
    hasRoute: false,
    routeDriveMins: 0,
    onViewMap: vi.fn(),
    userId: 'user-1',
    commitments: [
      {
        id: 'meeting-1',
        title: 'Project review',
        start_at: '2026-10-15T10:00:00',
        end_at: '2026-10-15T10:30:00',
        all_day: false,
        kind: 'meeting' as const,
      },
    ],
    isDesktop: false,
    dayDepth: {
      clockRemainingMins: 240,
      usableMins: 60,
      fixedMins: 30,
      plannedTaskMins: 120,
      travelMins: 0,
      fitsNow: ['Send the invoice'],
      dayRead: 'Your day is on track.',
      commitmentMarkers: [],
    },
  };
  const view = render(<TodayHeader {...props} />);
  return { ...view, props };
}

describe('replacement mobile Today instrument', () => {
  it('prioritises the day read and time capacity without duplicate summary cards', () => {
    renderMobileTodayHeader();

    expect(screen.getByRole('heading', { name: /Thursday Oct 15/ })).toBeTruthy();
    expect(screen.getByText('Work time remaining')).toBeTruthy();
    expect(screen.getByText('4h')).toBeTruthy();
    expect(screen.getByText('Planned')).toBeTruthy();
    expect(screen.getByText('Fixed')).toBeTruthy();
    expect(screen.queryByText('YOUR DAY, IN VIEW')).toBeNull();
    expect(screen.queryByText('DAY TIMELINE')).toBeNull();
  });

  it('reveals fixed commitments only when the timeline is requested', () => {
    renderMobileTodayHeader();

    const timeline = screen.getByRole('region', { name: 'Day timeline', hidden: true }) as HTMLElement;
    expect(timeline.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Timeline Show/i }));

    expect(screen.getByRole('region', { name: 'Day timeline' })).toBeTruthy();
    expect(screen.getByText('Project review')).toBeTruthy();
    expect(screen.getByText('10a')).toBeTruthy();
  });

  it('exposes learned fit on demand and keeps the map action available', () => {
    const { props } = renderMobileTodayHeader();

    fireEvent.click(screen.getByRole('button', { name: /Patterns and fit Show/i }));
    expect(screen.getByRole('region', { name: 'Patterns and fit' })).toBeTruthy();
    expect(screen.getByText('Send the invoice')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open map' }));
    expect(props.onViewMap).toHaveBeenCalledTimes(1);
  });
});
