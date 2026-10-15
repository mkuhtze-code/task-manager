import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readCss = (file: string) =>
  readFileSync(join(process.cwd(), 'app', file), 'utf8');

describe('canonical object visual ownership', () => {
  const shared = readCss('experience-objects.css');
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

  it('keeps domain-specific composition in the owning object sheet', () => {
    expect(surfaceSheets[0]).toContain('[data-experience-part="evidence"]');
    expect(surfaceSheets[1]).toContain('[data-experience-part="summary"]');
    expect(surfaceSheets[2]).toContain('trip-row-delete');
    expect(shared).toContain('[data-experience-object="task"] [data-experience-part="detail"]');
  });
});
