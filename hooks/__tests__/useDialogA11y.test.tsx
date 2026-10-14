// @vitest-environment happy-dom
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

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
  const dialogRef = useDialogA11y<HTMLDivElement>(() => setOpen(false), { enabled: open });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Conditional dialog">
          <button>Dialog action</button>
        </div>
      )}
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

  it('activates focus management when a dialog opens after its parent mounted', async () => {
    render(<ConditionalDialogFixture />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    opener.click();

    const dialog = screen.getByRole('dialog', { name: 'Conditional dialog' });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
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
