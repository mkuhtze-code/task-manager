// @vitest-environment happy-dom
import { useState } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function DialogFixture({
  onClose,
  trapFocus = true,
  autoFocus = true,
  active = true,
}: {
  onClose: () => void;
  trapFocus?: boolean;
  autoFocus?: boolean;
  active?: boolean;
}) {
  const dialogRef = useDialogA11y(onClose, { trapFocus, active });
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

  it('activates focus management when an always-mounted dialog becomes visible', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.appendChild(opener);
    opener.focus();

    const onClose = vi.fn();
    const view = render(<DialogFixture onClose={onClose} active={false} />);
    const dialog = screen.getByRole('dialog');

    expect(document.activeElement).toBe(opener);

    view.rerender(<DialogFixture onClose={onClose} active />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First action' })));

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.getAttribute('tabindex')).toBeNull();
  });

  it('sends Escape only to the topmost nested modal', async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    function NestedDialogs() {
      const outerRef = useDialogA11y(outerClose);
      const innerRef = useDialogA11y(innerClose);
      return (
        <>
          <div ref={outerRef} role="dialog" aria-modal="true" aria-label="Outer dialog">
            <button data-autofocus>Outer action</button>
          </div>
          <div ref={innerRef} role="dialog" aria-modal="true" aria-label="Inner dialog">
            <button data-autofocus>Inner action</button>
          </div>
        </>
      );
    }

    render(<NestedDialogs />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inner action' })));

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
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
