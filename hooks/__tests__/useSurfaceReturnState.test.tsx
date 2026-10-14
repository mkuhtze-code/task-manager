// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSurfaceReturnState } from '@/hooks/useSurfaceReturnState';

const KEY = 'dokkit.surface-return.test.v1';

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('useSurfaceReturnState', () => {
  it('restores saved view state and scroll after the surface is ready', async () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        state: { filter: 'past', search: 'invoice', selectedDate: '2026-10-12' },
        scrollY: 320,
      }),
    );
    const restore = vi.fn();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ ready }) =>
        useSurfaceReturnState(KEY, { filter: 'all', search: '', selectedDate: null }, restore, ready),
      { initialProps: { ready: false } },
    );

    expect(restore).not.toHaveBeenCalled();
    rerender({ ready: true });

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith({
        filter: 'past',
        search: 'invoice',
        selectedDate: '2026-10-12',
      });
      expect(scrollTo).toHaveBeenCalledWith(0, 320);
    });
  });

  it('saves the latest state and viewport when leaving a surface', () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 185,
    });
    const restore = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ state }) => useSurfaceReturnState(KEY, state, restore, true),
      { initialProps: { state: { filter: 'open', search: '', selectedDate: null } } },
    );

    rerender({
      state: { filter: 'done', search: 'client', selectedDate: '2026-10-15' },
    });
    act(() => unmount());

    expect(JSON.parse(window.sessionStorage.getItem(KEY) || 'null')).toEqual({
      version: 1,
      state: { filter: 'done', search: 'client', selectedDate: '2026-10-15' },
      scrollY: 185,
    });
  });

  it('ignores malformed or incompatible snapshots', async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ version: 9, state: {}, scrollY: -1 }));
    const restore = vi.fn();

    renderHook(() => useSurfaceReturnState(KEY, { filter: 'all' }, restore, true));

    await waitFor(() => expect(restore).not.toHaveBeenCalled());
  });
});
