// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
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
