// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';
import DesktopJobCard from '@/components/DesktopJobCard';

afterEach(() => cleanup());

const job: Job = {
  id: 'job-42',
  name: 'Harbour renovation',
  client: 'Morgan',
  location_text: 'Devonport',
  lat: null,
  lng: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

const task = {
  id: 'task-8',
  text: 'Confirm access with client',
  status: 'open',
} as unknown as Task;

describe('canonical job object landmarks', () => {
  it('exposes the canonical identity, state, context and next-work glance', () => {
    const { container } = render(
      <DesktopJobCard
        job={job}
        tasks={[task]}
        evidence={{ files: 1, photos: 2, observations: 0, meetings: 1, siteDays: 0 }}
        todayCount={1}
        nextTask={task}
        done={false}
      />
    );

    const object = container.querySelector('[data-experience-object="job"]');
    expect(object).not.toBeNull();
    expect(object?.getAttribute('data-object-state')).toBe('open');
    expect(object?.getAttribute('data-job-id')).toBe('job-42');
    expect(object?.querySelector('[data-experience-part="title"]')?.textContent).toBe('Harbour renovation');
    expect(object?.querySelector('[data-experience-part="state"]')?.textContent).toContain('open');
    expect(object?.querySelector('[data-experience-part="glance"]')?.textContent).toContain('Confirm access with client');
    expect(object?.textContent).toContain('Morgan');
    expect(object?.textContent).toContain('Devonport');
  });

  it('preserves the existing canonical job route and complete state', () => {
    const { container } = render(
      <DesktopJobCard
        job={job}
        tasks={[]}
        evidence={{ files: 0, photos: 0, observations: 0, meetings: 0, siteDays: 0 }}
        todayCount={0}
        nextTask={null}
        done={true}
      />
    );

    const object = container.querySelector('[data-experience-object="job"]') as HTMLAnchorElement;
    expect(object.getAttribute('href')).toBe('/jobs/job-42');
    expect(object.getAttribute('data-object-state')).toBe('complete');
    expect(screen.getByLabelText('Complete')).toBeTruthy();
    expect(screen.getByText('No work or evidence captured yet.')).toBeTruthy();
  });
});
