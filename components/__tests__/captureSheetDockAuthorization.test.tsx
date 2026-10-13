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
  detectCaptureCollection: () => null,
}));
vi.mock('@/lib/speech/taskListBridge', () => ({
  applyListIntent: vi.fn(),
  detectListIntent: () => null,
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
  return render(
    <CaptureSheet
      taskText="Call the client tomorrow"
      setTaskText={mocks.setTaskText}
      taskTime=""
      setTaskTime={vi.fn()}
      captureSuggestion={null}
      captureLocationSuggestion={null}
      captureLocationMemorySuggestion={null}
      captureJobSuggestion={null}
      captureContext={null}
      locationFieldVisible={false}
      addTask={mocks.addTask}
      captureLocation=""
      setCaptureLocation={vi.fn()}
      captureLocationCoords={null}
      setCaptureLocationCoords={vi.fn()}
      manualLocationToggle={false}
      setManualLocationToggle={vi.fn()}
      showReminderField={false}
      setShowReminderField={vi.fn()}
      captureSurfaceDate=""
      setCaptureSurfaceDate={vi.fn()}
      jobs={[]}
      captureJobId={null}
      setCaptureJobId={vi.fn()}
      thought={null}
      intendedTime=""
      locationResolution={null}
      declinedResolution={false}
      onConfirmResolution={vi.fn()}
      onDeclineResolution={vi.fn()}
      error=""
      onClose={mocks.onClose}
      userId="user-1"
      listOps={null}
      listTasks={[]}
      addTaskWithOverrides={mocks.addTaskWithOverrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('keeps the visible draft immediate and debounces parent text updates', () => {
    vi.useFakeTimers();
    try {
      renderCaptureSheet();
      const input = screen.getByPlaceholderText('What needs doing…') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Call the client at 2pm' } });

      expect(input.value).toBe('Call the client at 2pm');
      expect(mocks.setTaskText).not.toHaveBeenCalled();

      vi.advanceTimersByTime(180);
      expect(mocks.setTaskText).toHaveBeenCalledWith('Call the client at 2pm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes the latest visible draft before Dock executes', async () => {
    renderCaptureSheet();
    const input = screen.getByPlaceholderText('What needs doing…');

    // Hydration can complete asynchronously. Wait for the authenticated
    // Dock gate before simulating the click, then verify the latest draft wins.
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Dock' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.change(input, { target: { value: 'Invoice the client for the extra materials' } });
    expect(mocks.setTaskText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dock' }));

    await waitFor(() => {
      expect(mocks.runCaptureDock).toHaveBeenCalledWith(
        expect.objectContaining({ line: 'Invoice the client for the extra materials' }),
      );
    });
    expect(mocks.setTaskText).toHaveBeenCalledWith('Invoice the client for the extra materials');
  });

  it('only invokes the task executor after the user explicitly presses Dock', async () => {
    renderCaptureSheet();

    // Authenticated capture deliberately disables Dock until the remote engine
    // snapshot has hydrated. Wait for readiness before simulating the user's click.
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
});
