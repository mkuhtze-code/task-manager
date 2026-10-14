// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PillReveal from '@/components/PillReveal';

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

    // Escape originates from the focused control inside the popover so the
    // component-local handler can stop it before an enclosing modal sees it.
    fireEvent.keyDown(child, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
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
