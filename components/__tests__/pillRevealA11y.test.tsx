// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PillReveal from '@/components/PillReveal';
import { useDialogA11y } from '@/hooks/useDialogA11y';

function ModalWithPopover({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Meeting detail">
      <PillReveal label="Connections">
        <button type="button">Open connection</button>
      </PillReveal>
    </div>
  );
}

describe('PillReveal accessibility', () => {
  it('names the non-modal dialog, moves focus into it, and restores focus on Escape', async () => {
    render(
      <PillReveal label="Connections" count={2}>
        <button type="button">Open connection</button>
      </PillReveal>,
    );

    const trigger = screen.getByRole('button', { name: 'Connections 2' });
    fireEvent.click(trigger);

    const panel = await screen.findByRole('dialog', { name: 'Connections 2' });
    const child = screen.getByRole('button', { name: 'Open connection' });
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await waitFor(() => expect(document.activeElement).toBe(child));

    fireEvent.keyDown(child, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes a non-modal popover without closing its enclosing modal', async () => {
    const onModalClose = vi.fn();
    render(<ModalWithPopover onClose={onModalClose} />);

    const modal = screen.getByRole('dialog', { name: 'Meeting detail' });
    const trigger = screen.getByRole('button', { name: 'Connections' });
    await waitFor(() => expect(document.activeElement).toBe(modal));
    fireEvent.click(trigger);

    const child = await screen.findByRole('button', { name: 'Open connection' });
    await waitFor(() => expect(document.activeElement).toBe(child));
    fireEvent.keyDown(child, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connections' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(onModalClose).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it('does not trap Tab in the non-modal panel', async () => {
    render(
      <div>
        <PillReveal label="Job files">
          <button type="button">Open file</button>
        </PillReveal>
        <button type="button">Next page action</button>
      </div>,
    );

    const trigger = screen.getByRole('button', { name: 'Job files' });
    fireEvent.click(trigger);
    const child = await screen.findByRole('button', { name: 'Open file' });
    await waitFor(() => expect(document.activeElement).toBe(child));

    const next = screen.getByRole('button', { name: 'Next page action' });
    next.focus();
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(next);
  });
});
