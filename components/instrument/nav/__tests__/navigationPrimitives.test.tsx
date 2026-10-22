// @vitest-environment happy-dom
import { cleanup, render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpLink from '@/components/instrument/nav/UpLink';
import UtilityDone from '@/components/instrument/nav/UtilityDone';
import SheetDismiss from '@/components/instrument/nav/SheetDismiss';

afterEach(() => cleanup());

describe('Instrument navigation primitives', () => {
  it('uses an explicit parent href and parent-name label', () => {
    const { getByRole } = render(<UpLink href="/jobs" label="Jobs" />);
    const link = getByRole('link', { name: 'Jobs' });
    expect(link.getAttribute('href')).toBe('/jobs');
    expect(link.textContent).toContain('Jobs');
  });
  it('migrates job detail away from the generic Back label', () => {
    const page = readFileSync('app/jobs/[jobId]/page.tsx', 'utf8');
    expect(page).toContain('<UpLink href="/jobs" label="Jobs" />');
    expect(page).not.toContain('aria-label="Back to jobs"');
  });
  it('completes a utility surface to its explicit destination', () => {
    const { getByRole } = render(<UtilityDone href="/" />);
    expect(getByRole('link', { name: 'Done' }).getAttribute('href')).toBe('/');
  });
  it('provides an accessible transient dismiss control', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(<SheetDismiss onDismiss={onDismiss} label="Close" />);
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
