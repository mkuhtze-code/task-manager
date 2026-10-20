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


  it('keeps collapsed context and job evidence to one scan line', () => {
    expect(shared).toContain('-webkit-line-clamp: 1');
    expect(shared).toContain('[data-experience-object="job"] [data-experience-part="evidence"]');
    expect(shared).toContain('[data-experience-object="task"] .task-card-context');
  });

  it('keeps semantic state available on each canonical object type', () => {
    for (const type of ['task', 'job', 'meeting', 'trip']) {
      expect(shared).toContain(`[data-experience-object="${type}"]:focus-visible`);
    }
    const task = readFileSync(join(process.cwd(), 'components', 'TaskCard.tsx'), 'utf8');
    const jobs = readFileSync(join(process.cwd(), 'app', 'jobs', 'page.tsx'), 'utf8');
    const meetings = readFileSync(join(process.cwd(), 'components', 'MeetingObjectLink.tsx'), 'utf8');
    const travel = readFileSync(join(process.cwd(), 'components', 'TripObjectLink.tsx'), 'utf8');
    expect(task).toContain('data-object-state={running ? \'active\' : t.status}');
    expect(jobs).toContain("state={done ? 'complete' : 'open'}");
    expect(meetings).toContain('objectType="meeting"');
    expect(meetings).toContain('state={stateLabel}');
    expect(travel).toContain('objectType="trip"');
    expect(travel).toContain('state={stateLabel}');
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

    expect(frame).toContain('<AppShell');
    expect(frame).toContain('<SystemDock');
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

  it('keeps Today workspace language direct and task-focused', () => {
    const list = readFileSync(join(process.cwd(), 'components', 'today', 'TodayTaskList.tsx'), 'utf8');
    const rows = readFileSync(join(process.cwd(), 'components', 'today', 'TodayTaskRows.tsx'), 'utf8');
    const navigationCss = readCss('experience-navigation.css');

    expect(list).toContain('<h2 id="experience-work-heading">Tasks</h2>');
    expect(list).not.toContain('The flexible part of your day');
    expect(list).not.toContain('Your work');
    expect(list).not.toContain('Work around the commitments that cannot move.');
    expect(list).toContain('className="experience-work-stream"');
    expect(list).toContain('open tasks');
    expect(rows).toContain('className="experience-work-stream__item"');
    expect(rows).toContain('data-work-state={task.status');
    expect(navigationCss).toContain('.experience-work-stream__item[data-work-state="active"]');
    expect(navigationCss).toContain('grid-template-columns: 32px minmax(0, 1fr) auto auto');
    expect(navigationCss).toContain('@media (max-width: 360px)');
    expect(navigationCss).not.toContain('experience-work-list-heading__eyebrow');
    expect(navigationCss).not.toContain('experience-work-list-heading__description');
  });

  it('leads each mobile lens with its actual objects, not explanatory marketing copy', () => {
    const jobs = readFileSync(join(process.cwd(), 'app', 'jobs', 'page.tsx'), 'utf8');
    const meetings = readFileSync(join(process.cwd(), 'app', 'meetings', 'page.tsx'), 'utf8');
    const travel = readFileSync(join(process.cwd(), 'app', 'travel', 'page.tsx'), 'utf8');
    const navigationCss = readCss('experience-navigation.css');

    expect(jobs).not.toContain('Keep the whole job together.');
    expect(jobs).toContain('objectType="job"');
    expect(jobs).toContain('data-experience-part="evidence"');
    expect(meetings).not.toContain('Keep the thread, not just the time.');
    expect(travel).not.toContain('Make the movement part of the plan.');
    expect(navigationCss).not.toContain('experience-workspace-lede');
    expect(navigationCss).toContain('.meeting-section-title');
    expect(navigationCss).toContain('.trip-section-title');
  });

  it('uses the same segmented filters and bounded row grammar across mobile lenses', () => {
    const filter = readFileSync(join(process.cwd(), 'components', 'ExperienceFilterBar.tsx'), 'utf8');
    const jobs = readFileSync(join(process.cwd(), 'app', 'jobs', 'page.tsx'), 'utf8');
    const meetings = readFileSync(join(process.cwd(), 'app', 'meetings', 'page.tsx'), 'utf8');
    const travel = readFileSync(join(process.cwd(), 'app', 'travel', 'page.tsx'), 'utf8');
    const navigationCss = readCss('experience-navigation.css');

    expect(filter).toContain("role=\"tablist\"");
    expect(filter).toContain("className={value === option.key ? 'segmented-btn active' : 'segmented-btn'}");
    expect(filter).toContain('aria-selected={value === option.key}');
    for (const page of [jobs, meetings, travel]) {
      expect(page).toContain('<ExperienceFilterBar');
      expect(page).not.toContain('className="surface-filters" role="tablist"');
    }
    expect(navigationCss).toContain('.experience-filter-bar .segmented-btn');
    expect(navigationCss).toContain('.experience-mobile-frame .job-list,');
    expect(navigationCss).toContain('.experience-mobile-frame .meeting-list,');
    expect(navigationCss).toContain('.experience-mobile-frame .trip-list-maybach');
    expect(navigationCss).toContain('border-left: 2px solid transparent');
    expect(legacy).toContain('.job-row:not(.experience-mobile-frame *){display:block!important');
    expect(legacy).toContain('.meeting-row.surface-object:not(.experience-mobile-frame *)');
    expect(legacy).toContain('.trip-row-maybach.surface-object:not(.experience-mobile-frame *)');
  });

  it('keeps domain-specific composition in the owning object sheet', () => {
    expect(surfaceSheets[0]).toContain('[data-experience-part="evidence"]');
    expect(surfaceSheets[1]).toContain('[data-experience-part="summary"]');
    expect(surfaceSheets[2]).toContain('flex: 1 1 auto');
    expect(shared).toContain('[data-experience-object="task"] [data-experience-part="detail"]');
  });
});
