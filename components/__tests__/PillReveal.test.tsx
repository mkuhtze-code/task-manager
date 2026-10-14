// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import PillReveal from '@/components/PillReveal';

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

describe('PillReveal keyboard dismissal', () => {
  it('closes before an enclosing modal and restores focus to its trigger', async () => {
    const onModalClose = vi.fn();
    render(<ModalWithPopover onClose={onModalClose} />);

    const trigger = screen.getByRole('button', { name: 'Connections' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Meeting detail' })));

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Connections' })).toBeTruthy();
    const child = screen.getByRole('button', { name: 'Open connection' });
    child.focus();

    fireEvent.keyDown(child, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connections' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(onModalClose).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });
});
