// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/lib/taskTypes';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/taskIntelligence', () => ({ explainEstimate: () => null }));
vi.mock('@/lib/speech', () => ({ processCaptureSpeech: vi.fn() }));
vi.mock('@/hooks/useCaptureSpeech', () => ({ textForCaptureField: (value: string) => value }));
vi.mock('@/hooks/useDialogA11y', () => ({ useDialogA11y: () => null }));
vi.mock('@/components/LocationAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/MicButton', () => ({ default: () => null }));
vi.mock('@/components/icons', () => ({
  CheckIcon: () => null,
  CloseIcon: () => null,
  PlayIcon: () => null,
  StopIcon: () => null,
}));
vi.mock('@/components/TaskInfo', () => ({ TaskInfo: () => null }));
vi.mock('@/components/ContextLine', () => ({ default: () => null }));
vi.mock('@/components/TaskConnections', () => ({ TaskConnections: () => null }));
vi.mock('@/components/TaskJobField', () => ({ TaskJobField: () => null }));

function renderTaskDetail() {
  const props = {
    task: {
      id: 'task-1',
      text: 'Original task',
      estimate_mins: 30,
      surface_date: null,
      location_text: null,
      lat: null,
      lng: null,
      requires_visit: null,
      status: 'pending',
      due_today: false,
      created_at: '2026-10-15T00:00:00.000Z',
      job_id: null,
      intended_time: null,
      logged_mins: 0,
      started_at: null,
      info: '',
      order_index: 0,
    } as unknown as Task,
    subs: [],
    remainingForThis: 30,
    liveLogged: 0,
    anyActive: false,
    context: 'today' as const,
    jobs: [],
    onClose: vi.fn(),
    onSave: vi.fn(),
    onComplete: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleDue: vi.fn(),
    onAddSubtask: vi.fn(),
    onToggleSubtaskDone: vi.fn(),
    onDeleteSubtask: vi.fn(),
    onDelete: vi.fn(),
    onSaveInfo: vi.fn(),
    onMoveToJob: vi.fn(),
    subDraftText: '',
    subDraftTime: '',
    setSubDraftText: vi.fn(),
    setSubDraftTime: vi.fn(),
  };
  const view = render(<TaskDetailSheet {...props} />);
  return { ...view, props };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskDetailSheet validation recovery', () => {
  it('keeps the sheet open when closing an invalid empty title', () => {
    const { props } = renderTaskDetail();
    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Name cannot be empty')).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('preserves valid edits and stays open when persistence fails on close', async () => {
    const { props } = renderTaskDetail();
    props.onSave.mockResolvedValue(false);
    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: 'Updated task name' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText('Could not save your changes. Your edits are still here; try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Task name')).toHaveProperty('value', 'Updated task name');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps the latest draft open if it changes while a save is in flight', async () => {
    const { props } = renderTaskDetail();
    let resolveFirst!: (saved: boolean) => void;
    props.onSave
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(true);

    const input = screen.getByPlaceholderText('Task name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'First edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'Latest edit' } });
    resolveFirst(true);

    expect(await screen.findByText('Your edits changed while a save was in progress. Save again to keep the latest changes.')).toBeTruthy();
    expect(input.value).toBe('Latest edit');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onSave.mock.calls[1][1]).toBe('Latest edit');
  });

  it('does not complete or close a task when its valid edit fails to persist', async () => {
    const { props } = renderTaskDetail();
    props.onSave.mockResolvedValue(false);
    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: 'Updated before Done' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Could not save your changes. Your edits are still here; try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps the detail open when completion persistence fails', async () => {
    const { props } = renderTaskDetail();
    props.onSave.mockResolvedValue(true);
    props.onComplete.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Could not complete this task. It is still here; try again.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(props.onComplete).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('does not complete or close a task while its estimate is invalid', () => {
    const { props } = renderTaskDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Time, place, job' }));
    fireEvent.change(screen.getByPlaceholderText('15m'), {
      target: { value: 'sometime later' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Could not read that time, try 15m, 1.5h, or 0m')).toBeTruthy();
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
