import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TravelInstrument from '@/components/travel/TravelInstrument';
import TravelToolsStrip from '@/components/travel/TravelToolsStrip';
import TripDayPanel from '@/components/TripDayPanel';

afterEach(() => cleanup());

describe('R4.1 Travel Instrument contract', () => {
  it('renders supplied overview pulse values and one entitled Plan trip primary', () => {
    const onPlanTrip = vi.fn();
    render(<TravelInstrument activeCount={2} upcomingCount={3} pulseMeta="One trip needs attention" attention canCreate onPlanTrip={onPlanTrip} />);
    expect(screen.getByTestId('travel-instrument').getAttribute('data-active-count')).toBe('2');
    expect(screen.getByText('2 active')).toBeTruthy();
    expect(screen.getByText('One trip needs attention')).toBeTruthy();
    fireEvent.click(screen.getByTestId('travel-plan-primary'));
    expect(onPlanTrip).toHaveBeenCalledTimes(1);
  });

  it('omits Plan trip when creation is not entitled', () => {
    render(<TravelInstrument activeCount={0} upcomingCount={1} pulseMeta={null} attention={false} canCreate={false} onPlanTrip={() => {}} />);
    expect(screen.queryByTestId('travel-plan-primary')).toBeNull();
  });

  it('renders supplied day window, Add stop primary and secondary tools', () => {
    const onAddStop = vi.fn();
    const dayAnchor = { arrivalMins: 780, departureMins: null, windowStartMins: 825, windowEndMins: 1020, usableMins: 195, source: 'arrival' as const };
    render(
      <TripDayPanel dayLabel="Tuesday" dateLabel="Oct 20" dayAnchor={dayAnchor} flightScheduled fitLabel="Fits · 45m spare" conflictCount={0} meetingCount={1} daySheetOpen={false} onOpenDaySheet={() => {}} onAddStop={onAddStop}
        secondary={<TravelToolsStrip onFindPlace={() => {}} onOpenVault={() => {}} onOpenMap={() => {}} onOpenStay={() => {}} onEditDates={() => {}} datesOpen={false} sortLabel="Fit" onCycleSort={() => {}} onOpenLibrary={() => {}} />}
      />
    );
    expect(screen.getByTestId('travel-trip-day-instrument')).toBeTruthy();
    expect(screen.getByText('Flight · Land 1:00p · planning 1:45p–5:00p · 3h 15m usable')).toBeTruthy();
    expect(screen.getByText('Fits · 45m spare')).toBeTruthy();
    fireEvent.click(screen.getByTestId('travel-add-stop-primary'));
    expect(onAddStop).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('travel-tools-strip')).toBeTruthy();
  });

  it('wires both travel pages through the shared shell menu', () => {
    const overview = readFileSync(join(process.cwd(), 'app/travel/page.tsx'), 'utf8');
    const tripPage = readFileSync(join(process.cwd(), 'app/travel/[tripId]/page.tsx'), 'utf8');
    const chrome = readFileSync(join(process.cwd(), 'components/AppChrome.tsx'), 'utf8');
    expect(overview).toContain('<TravelInstrument');
    expect(overview).toContain('canCreate={canTravel}');
    expect(overview).not.toContain('GearMenu');
    expect(tripPage).toContain('<TripDayPanel');
    expect(tripPage).toContain('<TravelToolsStrip');
    expect(tripPage).not.toContain('GearMenu');
    expect(chrome).toContain('className="instrument-shell__global-tools"');
    const emptyState = overview.slice(overview.indexOf('trips.length === 0 ?'), overview.indexOf('totalVisible === 0 ?'));
    expect(emptyState).not.toContain('Plan a trip');
  });
});
