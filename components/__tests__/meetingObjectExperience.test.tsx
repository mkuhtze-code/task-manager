// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Meeting } from '@/lib/meetingTypes';
import MeetingObjectLink from '@/components/MeetingObjectLink';

afterEach(() => cleanup());

const meeting: Meeting = {
  id: 'meeting-17',
  user_id: 'user-1',
  text: 'Confirm the handover plan',
  duration_mins: 30,
  start_time: '2026-10-15T09:00:00.000Z',
  source: 'outlook',
  created_at: '2026-10-14T00:00:00.000Z',
  job_id: 'job-42',
  location_text: 'Devonport site',
  lat: null,
  lng: null,
  notes: 'Bring the revised drawings',
  summary: null,
};

describe('canonical meeting object landmarks', () => {
  it('exposes the existing meeting identity, time, source, context and open actions', () => {
    const { container } = render(
      <MeetingObjectLink
        meeting={meeting}
        jobName="Harbour renovation"
        pressure="soon"
        openActionCount={2}
        timeWindow="9:00 AM · 30m"
        relativeLine="in 20 minutes"
        hasNotes
      />
    );

    const object = container.querySelector('[data-experience-object="meeting"]') as HTMLAnchorElement;
    expect(object).not.toBeNull();
    expect(object.getAttribute('data-object-state')).toBe('soon');
    expect(object.getAttribute('data-meeting-id')).toBe('meeting-17');
    expect(object.getAttribute('href')).toBe('/meetings/meeting-17');
    expect(object.querySelector('[data-experience-part="title"]')?.textContent).toContain('Confirm the handover plan');
    expect(object.querySelector('[data-experience-part="glance"]')?.textContent).toContain('2 open');
    const context = object.querySelector('[data-experience-part="context"]');
    expect(context?.textContent).toContain('Harbour renovation');
    expect(context?.textContent).toContain('Devonport site');
    expect(object.querySelector('[aria-label="From Outlook"]')).not.toBeNull();
    expect(object.getAttribute('aria-label')).toContain('2 open actions');
  });

  it('retains past state and the same detail route when no actions remain', () => {
    const { container } = render(
      <MeetingObjectLink
        meeting={{ ...meeting, source: 'manual' }}
        jobName={null}
        pressure="done"
        openActionCount={0}
        timeWindow="Yesterday · 30m"
      />
    );

    const object = container.querySelector('[data-experience-object="meeting"]') as HTMLAnchorElement;
    expect(object.getAttribute('data-object-state')).toBe('past');
    expect(object.getAttribute('href')).toBe('/meetings/meeting-17');
    expect(object.textContent).toContain('Confirm the handover plan');
    const context = object.querySelector('[data-experience-part="context"]');
    expect(context).not.toBeNull();
    expect(context?.textContent).toContain('Devonport site');
    expect(context?.textContent).not.toContain('Harbour renovation');
  });
});
