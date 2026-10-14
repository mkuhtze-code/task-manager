// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Job } from '@/lib/jobTypes';
import type { Task } from '@/lib/taskTypes';
import { TaskConnections } from '@/components/TaskConnections';

describe('mobile working-slice relationship navigation', () => {
  it('exposes direct job and related-meeting links from task details', () => {
    const task = {
      id: 'task-42',
      text: 'Send the invoice',
      job_id: 'job-7',
    } as unknown as Task;
    const job = {
      id: 'job-7',
      name: 'Smith Street',
    } as unknown as Job;
    const meeting = {
      id: 'meeting-9',
      text: 'Site handover',
      duration_mins: 30,
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      job_id: 'job-7',
    };

    render(
      <TaskConnections
        task={task}
        job={job}
        meetings={[meeting]}
        showEmptyHint={false}
      />,
    );

    fireEvent.click(screen.getByText('Connections'));

    expect(screen.getByRole('link', { name: /Smith Street/ }).getAttribute('href'))
      .toBe('/jobs/job-7');
    expect(screen.getByRole('link', { name: /Site handover/ }).getAttribute('href'))
      .toBe('/meetings/meeting-9');
  });
});
