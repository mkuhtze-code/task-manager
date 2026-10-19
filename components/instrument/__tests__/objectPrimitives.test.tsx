// @vitest-environment happy-dom
import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ObjectRow from '@/components/instrument/ObjectRow';
import DepthSheet from '@/components/instrument/DepthSheet';
afterEach(() => cleanup());
describe('Instrument object primitives', () => {
  it('renders identity, glance, optional context and semantic state', () => {
    const { container } = render(<div data-instrument-shell><ObjectRow state="active" objectType="job" entityId="job-42" identity="Harbour renovation" glance="3 open" context="Devonport site" href="/jobs/job-42" /></div>);
    const row = container.querySelector('[data-instrument-object="row"]') as HTMLAnchorElement;
    expect(row.getAttribute('href')).toBe('/jobs/job-42');
    expect(row.getAttribute('data-object-state')).toBe('active');
    expect(row.getAttribute('data-job-id')).toBe('job-42');
    expect(row.querySelector('[data-experience-part="title"]')?.textContent).toBe('Harbour renovation');
    expect(row.querySelector('[data-experience-part="glance"]')?.textContent).toBe('3 open');
    expect(row.querySelector('[data-experience-part="context"]')?.textContent).toBe('Devonport site');
  });
  it('omits empty context', () => {
    const { container } = render(<div data-instrument-shell><ObjectRow state="pending" identity="Prepare drawings" glance="25m" /></div>);
    expect(container.querySelector('[data-experience-part="context"]')).toBeNull();
  });
  it('keeps DepthSheet landmarks in fixed order and dismisses from backdrop', () => {
    const dismiss = vi.fn();
    const { container, getByRole } = render(<div data-instrument-shell><DepthSheet dialogRef={null} onDismiss={dismiss} title="Task" identity="Prepare drawings" glance="25m" sections={<div>Schedule</div>} secondaryActions={<button>Start</button>} dangerZone={<button>Delete</button>} /></div>);
    const dialog = getByRole('dialog');
    const selectors = ['.ins-depth-sheet__header','.ins-depth-sheet__identity','.ins-depth-sheet__sections','.ins-depth-sheet__actions','.ins-depth-sheet__danger'];
    const indexes = selectors.map(selector => Array.from(dialog.children).findIndex(node => (node as HTMLElement).matches(selector)));
    expect(indexes).toEqual([...indexes].sort((a,b) => a-b));
    fireEvent.mouseDown(container.querySelector('[data-instrument-depth]') as HTMLElement);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
