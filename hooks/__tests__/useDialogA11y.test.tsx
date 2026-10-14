// @vitest-environment happy-dom
import { useState } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import PillReveal from '@/components/PillReveal';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function DialogFixture({
  onClose,
  trapFocus = true,
  autoFocus = true,
}: {
  onClose: () => void;
  trapFocus?: boolean;
  autoFocus?: boolean;
}) {
  const dialogRef = useDialogA11y(onClose, { trapFocus });
  return (
    <div ref={dialogRef} role="dialog" aria-modal={trapFocus ? 'true' : undefined}>
      <button data-autofocus={autoFocus ? '' : undefined}>First action</button>
      <button>Middle action</button>
      <button>Last action</button>
    </div>
  );
}

function ConditionalDialogFixture() {
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogA11y(() => setOpen(false));
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open conditional dialog</button>
      {open ? (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Conditional dialog">
          <button>First action</button>
          <button>Last action</button>
        </div>
      ) : null}
    </div>
  );
}

function NestedDialogFixture({
  onOuterClose,
  onInnerClose,
}: {
  onOuterClose: () => void;
  onInnerClose: () => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useDialogA11y(onOuterClose);
  const innerRef = useDialogA11y(() => {
    onInnerClose();
    setInnerOpen(false);
  });

  return (
    <>
      <div ref={outerRef} role="dialog" aria-modal="true" aria-label="Outer dialog">
        <button data-autofocus type="button" onClick={() => setInnerOpen(true)}>
          Open inner dialog
        </button>
      </div>
      {innerOpen ? (
        <div ref={innerRef} role="dialog" aria-modal="true" aria-label="Inner dialog">
          <button data-autofocus>First inner action</button>
          <button>Last inner action</button>
        </div>
      ) : null}
    </>
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('useDialogA11y', () => {
  it('wraps Tab and Shift+Tab inside a modal and restores the opener focus', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.appendChild(opener);
    opener.focus();

    const onClose = vi.fn();
    const view = render(<DialogFixture onClose={onClose} />);
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    await waitFor(() => expect(document.activeElement).toBe(first));

    last.focus();
    const forwardTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(forwardTab);
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const backwardTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(backwardTab);
    expect(backwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('activates focus management when the modal mounts after its owner', async () => {
    const view = render(<ConditionalDialogFixture />);
    const opener = screen.getByRole('button', { name: 'Open conditional dialog' });
    opener.focus();
    opener.click();

    const dialog = await screen.findByRole('dialog', { name: 'Conditional dialog' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    await waitFor(() => expect(document.activeElement).toBe(dialog));
    last.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    view.unmount();
  });

  it('gives Tab and Escape to the topmost nested modal only', async () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<NestedDialogFixture onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);

    const openInner = screen.getByRole('button', { name: 'Open inner dialog' });
    await waitFor(() => expect(document.activeElement).toBe(openInner));
    fireEvent.click(openInner);

    await screen.findByRole('dialog', { name: 'Inner dialog' });
    const first = screen.getByRole('button', { name: 'First inner action' });
    const last = screen.getByRole('button', { name: 'Last inner action' });
    await waitFor(() => expect(document.activeElement).toBe(first));

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inner dialog' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(openInner));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });

  it('moves initial focus to the modal container when no control is designated', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.appendChild(opener);
    opener.focus();

    render(<DialogFixture onClose={vi.fn()} autoFocus={false} />);
    const dialog = screen.getByRole('dialog');

    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });

  it('returns focus to a non-modal popover trigger when Escape closes it', async () => {
    render(
      <PillReveal label="Connections">
        <button type="button">Open job</button>
      </PillReveal>,
    );

    const trigger = screen.getByRole('button', { name: 'Connections' });
    fireEvent.click(trigger);
    const panelAction = screen.getByRole('button', { name: 'Open job' });

    // Wait for the popover's open effect and initial-focus frame before
    // testing its Escape listener; this avoids racing the effect setup.
    await waitFor(() => expect(document.activeElement).toBe(panelAction));

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(escape);
    });

    expect(escape.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('does not trap focus in a non-modal detail pane', () => {
    const onClose = vi.fn();
    render(<DialogFixture onClose={onClose} trapFocus={false} />);
    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(last);
  });
});
