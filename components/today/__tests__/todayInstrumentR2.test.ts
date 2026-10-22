import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('R2 Today composition contract', () => {
  const instrument = read('components/today/TodayInstrument.tsx');
  const page = read('components/today/TodayPage.tsx');
  const chrome = read('components/AppChrome.tsx');
  const list = read('components/today/TodayTaskList.tsx');

  it('exposes identity, existing capacity values and one Capture primary', () => {
    expect(instrument).toContain('data-testid="today-instrument"');
    expect(instrument).toContain('data-testid="today-capture-primary"');
    expect(instrument).toContain('minutesLeftToday');
    expect(instrument).toContain("fmtMins(minutesLeftToday) + ' left'");
    expect(instrument).toContain('remainingWorkMins');
    expect(chrome).toContain('<TodayInstrument');
    expect(chrome).toContain('<GearMenu context="work" userId={session.user.id} />');
    expect(instrument).toContain('data-testid="today-instrument"');
    expect(page).toContain('onDockIt={() => setCaptureOpen(true)}');
    expect(list).not.toContain('className="btn btn-steel" onClick={onAdd}');
  });

  it('renders regime only when supplied and links to the trip', () => {
    expect(instrument).toContain('{regimeLabel && regimeHref ?');
    expect(instrument).toContain('href={regimeHref}');
    expect(page).toContain('travelTodayContext && travelRegimeLabel');
    expect(page).toContain('/travel/${travelTodayContext.tripId}');
  });

  it('preserves task landmarks and mutation callbacks', () => {
    expect(chrome).toContain("pathname === '/'");
    expect(page).toContain('<TodayTaskList');
    expect(page).toContain('onComplete: completeTask');
    expect(page).toContain('onStart: startTask');
    expect(page).toContain('onStop: stopTask');
    expect(page).toContain('onToggleSubtaskDone: toggleSubtaskDone');
    expect(page).toContain('onSaveInfo: saveTaskInfo');
  });

  it('does not move capacity formulas into the presentation component', () => {
    expect(instrument).not.toContain('deriveTodayCapacity');
    expect(instrument).not.toContain('composeTravelCapacity');
    expect(instrument).not.toContain('computeTravelPresenceImpact');
  });
});
