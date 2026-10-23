// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSurfaceReturnState } from '@/hooks/useSurfaceReturnState';
import { clearLensState, deserializeLensState, loadLensState, saveLensState, serializeLensState } from '@/lib/nav/returnState';

const KEY = 'dokkit.surface-return.test.v1';

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  vi.restoreAllMocks();
});

describe('useSurfaceReturnState', () => {
  it('restores saved view state and scroll after the surface is ready', async () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        state: {
          filter: 'past',
          search: 'invoice',
          selectedDate: '2026-10-12',
          openTaskId: 'task-42',
          expandedId: 'task-42',
        },
        scrollY: 320,
      }),
    );
    const restore = vi.fn();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ ready }) =>
        useSurfaceReturnState(
          KEY,
          {
            filter: 'all',
            search: '',
            selectedDate: null,
            openTaskId: null,
            expandedId: null,
          },
          restore,
          ready,
        ),
      { initialProps: { ready: false } },
    );

    expect(restore).not.toHaveBeenCalled();
    rerender({ ready: true });

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith({
        filter: 'past',
        search: 'invoice',
        selectedDate: '2026-10-12',
        openTaskId: 'task-42',
        expandedId: 'task-42',
      });
      expect(scrollTo).toHaveBeenCalledWith(0, 320);
    });
  });

  it('saves the latest state and viewport when leaving a surface', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 185,
    });
    const restore = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ state }) => useSurfaceReturnState(KEY, state, restore, true),
      {
        initialProps: {
          state: {
            filter: 'open',
            search: '',
            selectedDate: null,
            openTaskId: null,
            expandedId: null,
          },
        },
      },
    );

    rerender({
      state: {
        filter: 'done',
        search: 'client',
        selectedDate: '2026-10-15',
        openTaskId: 'task-42',
        expandedId: 'task-42',
      },
    });
    act(() => unmount());

    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem(KEY) || 'null')).toEqual({
      version: 1,
      state: {
        filter: 'done',
        search: 'client',
        selectedDate: '2026-10-15',
        openTaskId: 'task-42',
        expandedId: 'task-42',
      },
      scrollY: 185,
    }));
  });

  it('ignores malformed or incompatible snapshots', async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ version: 9, state: {}, scrollY: -1 }));
    const restore = vi.fn();

    renderHook(() => useSurfaceReturnState(KEY, { filter: 'all' }, restore, true));

    await waitFor(() => expect(restore).not.toHaveBeenCalled());
  });
});


describe('lens return-state helpers', () => {
  it('serializes and restores a valid state snapshot', () => {
    const raw = serializeLensState({ filter: 'past', search: 'invoice' }, 320);
    expect(deserializeLensState<{ filter: string; search: string }>(raw)).toEqual({
      version: 1, state: { filter: 'past', search: 'invoice' }, scrollY: 320,
    });
  });
  it('saves, loads, and clears only the requested session key', () => {
    saveLensState('return.a', { selectedDayId: 'day-2' }, 0);
    saveLensState('return.b', { selectedDayId: 'day-4' }, 0);
    expect(loadLensState<{ selectedDayId: string }>('return.a')?.state.selectedDayId).toBe('day-2');
    clearLensState('return.a');
    expect(loadLensState('return.a')).toBeNull();
    expect(loadLensState<{ selectedDayId: string }>('return.b')?.state.selectedDayId).toBe('day-4');
  });
  it('normalizes negative scroll and rejects malformed snapshots', () => {
    expect(deserializeLensState(serializeLensState({ ok: true }, -12))?.scrollY).toBe(0);
    expect(deserializeLensState('not-json')).toBeNull();
    expect(deserializeLensState(JSON.stringify({ version: 2, state: {}, scrollY: 0 }))).toBeNull();
    expect(deserializeLensState(JSON.stringify({ version: 1, state: {}, scrollY: -1 }))).toBeNull();
  });
});
