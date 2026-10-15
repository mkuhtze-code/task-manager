// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/lib/taskTypes';
import { TaskCard } from '@/components/TaskCard';

afterEach(() => cleanup());

function renderTaskCard() {
  const task = {
    id: 'task-1',
    text: 'Send invoice',
    estimate_mins: 45,
    logged_mins: 10,
    status: 'active',
    due_today: false,
    source: 'manual',
    intended_time: null,
    job_id: null,
    location_text: null,
    info: '',
  } as unknown as Task;

  const actions = {
    onToggleExpand: vi.fn(),
    onOpenDetails: vi.fn(),
    onComplete: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleSubtaskDone: vi.fn(),
    onSaveInfo: vi.fn(),
  };

  const view = render(
    <TaskCard
      task={task}
      remainingForThis={35}
      liveLogged={12}
      overCap={false}
      anyActive={true}
      subs={[]}
      learnedHint={null}
      expanded={false}
      {...actions}
    />
  );

  return { ...view, actions };
}

describe('canonical task object landmarks', () => {
  it('exposes stable object identity, state, and summary/detail parts', () => {
    const { container } = renderTaskCard();
    const object = container.querySelector('[data-experience-object="task"]');

    expect(object).not.toBeNull();
    expect(object?.getAttribute('data-object-state')).toBe('active');
    expect(object?.getAttribute('data-expanded')).toBe('false');
    expect(object?.querySelector('[data-experience-part="title"]')?.textContent).toBe('Send invoice');
    expect(object?.querySelector('[data-experience-part="summary"]')).not.toBeNull();
    expect(object?.querySelector('[data-experience-part="glance"]')).not.toBeNull();
  });

  it('keeps the existing expand and complete actions connected', () => {
    const { actions } = renderTaskCard();

    fireEvent.click(screen.getByRole('button', { name: /Send invoice\. expand/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete Send invoice' }));

    expect(actions.onToggleExpand).toHaveBeenCalledTimes(1);
    expect(actions.onComplete).toHaveBeenCalledWith('task-1');
  });
});
