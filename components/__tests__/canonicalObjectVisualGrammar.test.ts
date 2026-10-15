import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readCss = (file: string) =>
  readFileSync(join(process.cwd(), 'app', file), 'utf8');

describe('canonical object visual ownership', () => {
  const shared = readCss('experience-objects.css');
  const legacy = readCss('surface-system.css');
  const surfaceSheets = [
    readCss('experience-job-object.css'),
    readCss('experience-meeting-object.css'),
    readCss('experience-travel-object.css'),
  ];

  it('owns title, glance, context, focus and responsive summary rhythm centrally', () => {
    for (const type of ['task', 'job', 'meeting', 'trip']) {
      expect(shared).toContain(`[data-experience-object="${type}"] [data-experience-part="title"]`);
      expect(shared).toContain(`[data-experience-object="${type}"] [data-experience-part="glance"]`);
      expect(shared).toContain(`[data-experience-object="${type}"]:focus-visible`);
    }

    expect(shared).toContain('--experience-object-title-size: 14px');
    expect(shared).toContain('--experience-object-glance-size: 12px');
    expect(shared).toContain('--experience-object-context-size: 11px');
    expect(shared).toContain('[data-experience-object="job"] .desk-job-card-context');
    expect(shared).toContain('.meeting-row-top');
    expect(shared).toContain('.trip-row-top');
  });

  it('keeps surface-specific object sheets free of duplicate shared typography and focus rules', () => {
    for (const css of surfaceSheets) {
      expect(css).not.toMatch(/\[data-experience-part="title"\][\s\S]{0,180}font-size:/);
      expect(css).not.toMatch(/\[data-experience-part="glance"\][\s\S]{0,180}font-size:/);
      expect(css).not.toContain(':focus-visible');
    }
  });

  it('keeps legacy surface-system typography and layout rules off canonical frame descendants', () => {
    expect(legacy).toContain('.surface-object-title:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.surface-object-time:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.task-card-context:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.desk-job-card-context:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.meeting-row-context:not(.experience-mobile-frame *){display:flex!important');
    expect(legacy).toContain('.trip-row-context:not(.experience-mobile-frame *){display:flex!important');
    expect(legacy).toContain('.meeting-row-glance:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.desk-job-card-next:not(.experience-mobile-frame *)');
  });

  it('uses one global mobile navigation spine instead of per-page tab bars', () => {
    const frame = readFileSync(join(process.cwd(), 'components', 'AppChrome.tsx'), 'utf8');
    const nav = readFileSync(join(process.cwd(), 'components', 'SurfaceNav.tsx'), 'utf8');
    const navigationCss = readCss('experience-navigation.css');
    const today = readFileSync(join(process.cwd(), 'components', 'today', 'TodayPage.tsx'), 'utf8');
    const jobs = readFileSync(join(process.cwd(), 'app', 'jobs', 'page.tsx'), 'utf8');
    const meetings = readFileSync(join(process.cwd(), 'app', 'meetings', 'page.tsx'), 'utf8');
    const travel = readFileSync(join(process.cwd(), 'app', 'travel', 'page.tsx'), 'utf8');

    expect(frame).toContain('<SurfaceNav');
    expect(frame).toContain('subscribeDesktopPrimaryAction');
    expect(frame).toContain("pathname === '/'");
    expect(nav).toContain('experience-primary-nav__tabs');
    expect(navigationCss).toContain('position: fixed');
    expect(navigationCss).toContain('env(safe-area-inset-bottom');
    expect(navigationCss).toContain('.surface-title');
    expect(today).not.toContain('<SurfaceNav');
    expect(jobs).not.toContain('<SurfaceNav');
    expect(meetings).not.toContain('<SurfaceNav');
    expect(travel).not.toContain('<SurfaceNav');
  });

  it('keeps domain-specific composition in the owning object sheet', () => {
    expect(surfaceSheets[0]).toContain('[data-experience-part="evidence"]');
    expect(surfaceSheets[1]).toContain('[data-experience-part="summary"]');
    expect(surfaceSheets[2]).toContain('flex: 1 1 auto');
    expect(shared).toContain('[data-experience-object="task"] [data-experience-part="detail"]');
  });
});
