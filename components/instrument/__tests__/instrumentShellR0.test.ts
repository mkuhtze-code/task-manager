import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Instrument shell R0 contract', () => {
  it('keeps the four stable destinations in product order', () => {
    const nav = read('components/SurfaceNav.tsx');
    const order = [
      "key: 'today', label: 'Today', path: '/'",
      "key: 'jobs', label: 'Jobs', path: '/jobs', pro: true",
      "key: 'meetings', label: 'Meetings', path: '/meetings', pro: true",
      "key: 'travel', label: 'Travel', path: '/travel', pro: true",
    ];
    let previous = -1;
    for (const item of order) {
      const index = nav.indexOf(item);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(nav).toContain("aria-current={isCurrent ? 'page' : undefined}");
  });

  it('uses the existing Pro billing redirect for locked destinations', () => {
    const nav = read('components/SurfaceNav.tsx');
    expect(nav).toContain('if (pro && !isPro)');
    expect(nav).toContain('/account/billing?feature=${feature}');
    expect(nav).toContain('key === \'meetings\' ? \'meetings\'');
  });

  it('mounts the shell and keeps the dock behind the authenticated boundary', () => {
    const chrome = read('components/AppChrome.tsx');
    expect(chrome).toContain('<AppShell');
    expect(chrome).toContain('session?.user?.id && currentSurfaceIndex(pathname) >= 0');
    expect(chrome).toContain('<SystemDock');
    expect(chrome).toContain('onAdd={primaryAction ? requestCaptureOpen : undefined}');
  });

  it('isolates shell styles and loads tokens before shell CSS after legacy CSS', () => {
    const layout = read('app/layout.tsx');
    expect(layout.indexOf("import './experience-navigation.css'")).toBeLessThan(layout.indexOf("import './instrument-tokens.css'"));
    expect(layout.indexOf("import './instrument-tokens.css'")).toBeLessThan(layout.indexOf("import './instrument-shell.css'"));
    const css = read('app/instrument-shell.css');
    expect(css).toContain('[data-instrument-shell]');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).not.toContain('!important');
  });
});
