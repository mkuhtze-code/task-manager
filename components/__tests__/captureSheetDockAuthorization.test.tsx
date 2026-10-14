// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCaptureDock: vi.fn(),
  executeCpuDecision: vi.fn(),
  addTaskWithOverrides: vi.fn(),
  addTask: vi.fn(),
  setTaskText: vi.fn(),
  onClose: vi.fn(),
  detectCaptureCollection: vi.fn(() => null),
  detectListIntent: vi.fn(() => null),
}));

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/hooks/useCaptureSpeech', () => ({
  useCaptureSpeech: () => ({
    speechStatus: null,
    processSpokenText: vi.fn(),
    clearSpeechStatus: vi.fn(),
    confirmSpeechLearning: vi.fn(),
  }),
  textForCaptureField: (value: string) => value,
}));
vi.mock('@/hooks/useDialogA11y', () => ({ useDialogA11y: () => null }));
vi.mock('@/lib/uxFlags', () => ({
  shouldShowEstimateHint: () => false,
  markEstimateHintSeen: vi.fn(),
}));
vi.mock('@/lib/engine', () => ({
  hydrateEngineStateRemote: vi.fn(async () => ({ activeRequest: null })),
  loadActiveRequestLocal: vi.fn(() => null),
  loadWorkingMemoryLocal: vi.fn(() => ({})),
  saveActiveRequestLocal: vi.fn(),
  pushEngineStateRemote: vi.fn(async () => ({ stateSaved: true, evidenceSaved: true })),
}));
vi.mock('@/lib/engine/captureDock', () => ({
  runCaptureDock: mocks.runCaptureDock,
  loadPriorForDock: vi.fn(() => null),
}));
vi.mock('@/lib/cpu', () => ({
  executeCpuDecision: mocks.executeCpuDecision,
}));
vi.mock('@/lib/speech', () => ({
  captureIsCollectionMutation: () => false,
  detectCaptureCollection: mocks.detectCaptureCollection,
}));
vi.mock('@/lib/speech/taskListBridge', () => ({
  applyListIntent: vi.fn(),
  detectListIntent: mocks.detectListIntent,
  loadActiveListState: () => ({ taskId: null, title: null, lastInteractionAt: null }),
  canUseActiveList: () => false,
}));
vi.mock('@/lib/unifiedInput/oneShot', () => ({
  oneShotGate: () => ({ ready: true }),
}));
vi.mock('@/components/LocationAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/MicButton', () => ({ default: () => null }));
vi.mock('@/components/icons', () => ({ MapPinIcon: () => null }));

import { CaptureSheet } from '@/components/CaptureSheet';

function renderCaptureSheet() {
  const props: Parameters<typeof CaptureSheet>[0] = {
    taskText: "Call the client tomorrow",
    setTaskText: mocks.setTaskText,
    entityMemory: { aliases: [], activeEntityIds: new Set<string>() },
    taskTime: "",
    setTaskTime: vi.fn(),
    captureSuggestion: null,
    captureLocationSuggestion: null,
    captureLocationMemorySuggestion: null,
    captureJobSuggestion: null,
    captureContext: null,
    locationFieldVisible: false,
    addTask: mocks.addTask,
    captureLocation: "",
    setCaptureLocation: vi.fn(),
    captureLocationCoords: null,
    setCaptureLocationCoords: vi.fn(),
    manualLocationToggle: false,
    setManualLocationToggle: vi.fn(),
    showReminderField: false,
    setShowReminderField: vi.fn(),
    captureSurfaceDate: "",
    setCaptureSurfaceDate: vi.fn(),
    jobs: [],
    captureJobId: null,
    setCaptureJobId: vi.fn(),
    thought: null,
    intendedTime: "",
    locationResolution: null,
    declinedResolution: false,
    onConfirmResolution: vi.fn(),
    onDeclineResolution: vi.fn(),
    error: "",
    onClose: mocks.onClose,
    userId: "user-1",
    listOps: null,
    listTasks: [],
    addTaskWithOverrides: mocks.addTaskWithOverrides,
  };
  const view = render(<CaptureSheet {...props} />);
  return Object.assign(view, {
    rerenderWithProps: (overrides: Partial<typeof props>) =>
      view.rerender(<CaptureSheet {...props} {...overrides} />),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addTaskWithOverrides.mockResolvedValue('task-1');
  mocks.detectCaptureCollection.mockReturnValue(null);
  mocks.detectListIntent.mockReturnValue(null);
  mocks.runCaptureDock.mockReturnValue({
    kind: 'act_create',
    message: 'Ready to create task',
    cpuCycle: { decision: { outcome: 'ACT' } },
    overrides: {
      text: 'Call the client tomorrow',
      originalInput: 'Call the client tomorrow',
    },
  });
  mocks.executeCpuDecision.mockImplementation(async (_cycle, executors) => {
    const taskId = await executors.tasks.createTask({ text: 'Call the client tomorrow' });
    return { executed: true, execution: { status: 'executed', taskId } };
  });



});

describe('Capture Dock UI authorization boundary', () => {
  it('does not execute or persist anything just because the capture sheet rendered', () => {
    renderCaptureSheet();

    expect(mocks.runCaptureDock).not.toHaveBeenCalled();
    expect(mocks.executeCpuDecision).not.toHaveBeenCalled();
    expect(mocks.addTaskWithOverrides).not.toHaveBeenCalled();
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it('keeps typing local and publishes the draft at a commit boundary', () => {
    vi.useFakeTimers();
    try {
      renderCaptureSheet();
      const input = screen.getByPlaceholderText('What needs doing…') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Call the client at 2pm' } });

      expect(input.value).toBe('Call the client at 2pm');
      expect(mocks.setTaskText).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(mocks.setTaskText).not.toHaveBeenCalled();

      fireEvent.blur(input);
      expect(mocks.setTaskText).toHaveBeenCalledWith('Call the client at 2pm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the latest local draft without flushing parent state before Dock executes', async () => {
    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…');

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.change(input, { target: { value: 'Invoice the client for the extra materials' } });
    expect(mocks.setTaskText).not.toHaveBeenCalled();

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => {
      expect(mocks.runCaptureDock).toHaveBeenCalledWith(
        expect.objectContaining({ line: 'Invoice the client for the extra materials' }),
      );
    });
    expect(mocks.setTaskText).not.toHaveBeenCalled();
  });

  it('does not rerun live list classification for unrelated sheet state changes', async () => {
    const view = renderCaptureSheet();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    const primaryCalls = mocks.detectCaptureCollection.mock.calls.length;
    const fallbackCalls = mocks.detectListIntent.mock.calls.length;

    view.rerenderWithProps({ error: 'Unrelated validation message' });

    expect(mocks.detectCaptureCollection).toHaveBeenCalledTimes(primaryCalls);
    expect(mocks.detectListIntent).toHaveBeenCalledTimes(fallbackCalls);
  });

  it('skips fallback list detection when the primary classifier already found an intent', async () => {
    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…');
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.change(input, { target: { value: 'Create a grocery list' } });
    mocks.detectCaptureCollection.mockReturnValue({
      intent: { type: 'create_collection', title: 'Groceries' },
    } as never);
    const fallbackCallsBeforeDock = mocks.detectListIntent.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => expect(screen.getByText('Sign in to use lists.')).toBeTruthy());
    expect(mocks.detectCaptureCollection.mock.calls.some(([value]) => value === 'Create a grocery list')).toBe(true);
    // Once the primary classifier returns an intent, neither the live preview
    // nor Dock should evaluate the fallback detector.
    expect(mocks.detectListIntent.mock.calls.length).toBe(fallbackCallsBeforeDock);
    expect(mocks.runCaptureDock).not.toHaveBeenCalled();
  });

  it('shows Docking before synchronous interpretation begins', async () => {
    mocks.runCaptureDock.mockImplementationOnce(() => {
      expect(screen.getByRole('button', { name: 'Docking…' })).toBeTruthy();
      return {
        kind: 'act_create',
        message: 'Ready to create task',
        cpuCycle: { decision: { outcome: 'ACT' } },
        overrides: {
          text: 'Call the client tomorrow',
          originalInput: 'Call the client tomorrow',
        },
      };
    });

    renderCaptureSheet();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => expect(mocks.runCaptureDock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1));
  });

  it('passes an explicit parsed payload on ordinary fallthrough', async () => {
    mocks.runCaptureDock.mockReturnValueOnce({ kind: 'fallthrough', message: null });

    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…');
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.change(input, { target: { value: 'Schedule the client for tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1));
    expect(mocks.addTaskWithOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        originalInput: 'Schedule the client for tomorrow',
        parsedThought: expect.objectContaining({}),
      }),
    );
    expect(mocks.setTaskText).not.toHaveBeenCalled();
  });

  it('only invokes the task executor after the user explicitly presses Dock', async () => {
    renderCaptureSheet();

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1));
    expect(mocks.runCaptureDock).toHaveBeenCalledTimes(1);
    expect(mocks.executeCpuDecision).toHaveBeenCalledTimes(1);
    const engine = await import('@/lib/engine');
    expect(engine.saveActiveRequestLocal).toHaveBeenCalledWith(null, 'user-1');
    expect(engine.pushEngineStateRemote).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.anything(),
      null,
      [],
    );
    expect(mocks.addTaskWithOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Call the client tomorrow',
        originalInput: 'Call the client tomorrow',
      }),
    );
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it('locks rapid repeated Dock presses to one in-flight create', async () => {
    let finishCreate!: () => Promise<void>;
    mocks.executeCpuDecision.mockImplementationOnce((_cycle, executors) =>
      new Promise((resolve) => {
        finishCreate = async () => {
          const taskId = await executors.tasks.createTask({ text: 'Call the client tomorrow' });
          resolve({ executed: true, execution: { status: 'executed', taskId: taskId ?? 'task-1' } });
        };
      }),
    );

    renderCaptureSheet();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    const dock = screen.getByRole('button', { name: 'Dock' });
    fireEvent.click(dock);
    fireEvent.click(dock);
    fireEvent.click(dock);

    expect((screen.getByRole('button', { name: 'Docking…' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(mocks.runCaptureDock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.executeCpuDecision).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(finishCreate).toBeDefined());
    await finishCreate();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1);
  });

  it('blocks a second Dock of an unchanged draft after success, but allows a new draft', async () => {
    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…');
    const dock = () => screen.getByRole('button', { name: 'Dock' });

    await waitFor(() => expect((dock() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dock());
    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((dock() as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(dock());
    await waitFor(() => expect(screen.getByText(/already saved/i)).toBeTruthy());
    expect(mocks.runCaptureDock).toHaveBeenCalledTimes(1);
    expect(mocks.executeCpuDecision).toHaveBeenCalledTimes(1);
    expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1);

    // Re-query after the successful Dock because the capture input may be
    // replaced when the sheet reconciles the committed draft.
    const freshInput = screen.getByPlaceholderText('What needs doing…');
    fireEvent.change(freshInput, { target: { value: 'Call the supplier about delivery' } });
    await waitFor(() => expect((screen.getByPlaceholderText('What needs doing…') as HTMLInputElement).value).toBe('Call the supplier about delivery'));
    await waitFor(() => expect((dock() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dock());

    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(2));
    expect(mocks.runCaptureDock).toHaveBeenCalledTimes(2);
    expect(mocks.addTaskWithOverrides).toHaveBeenLastCalledWith(
      expect.objectContaining({ originalInput: 'Call the supplier about delivery' }),
    );
  });

  it('keeps the draft retryable when persistence cannot confirm a task ID', async () => {
    mocks.addTaskWithOverrides
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('task-2');

    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…') as HTMLInputElement;
    const dock = () => screen.getByRole('button', { name: 'Dock' });

    await waitFor(() => expect((dock() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dock());

    await waitFor(() => expect(screen.getByText(/Could not confirm the save/i)).toBeTruthy());
    expect(input.value).toBe('Call the client tomorrow');
    expect((dock() as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(dock());
    await waitFor(() => expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((dock() as HTMLButtonElement).disabled).toBe(false));
    expect(input.value).toBe('Call the client tomorrow');
    expect(screen.queryByText(/already saved/i)).toBeNull();
  });

  it('clears the busy lock after a failed dock so the user can retry', async () => {
    mocks.executeCpuDecision
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementationOnce(async (_cycle, executors) => {
        const taskId = await executors.tasks.createTask({ text: 'Call the client tomorrow' });
        return { executed: true, execution: { status: 'executed', taskId } };
      });

    renderCaptureSheet();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));
    await waitFor(() => expect(mocks.executeCpuDecision).toHaveBeenCalledTimes(2));
    expect(mocks.addTaskWithOverrides).toHaveBeenCalledTimes(1);
  });

});