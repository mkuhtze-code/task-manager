// @vitest-environment happy-dom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SurfaceDateCarousel from '@/components/SurfaceDateCarousel';

function DateCarouselHarness() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  return <SurfaceDateCarousel selectedDate={selectedDate} onChange={setSelectedDate} />;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('SurfaceDateCarousel mobile date navigation', () => {
  it('jumps to a distant date and returns to today', async () => {
    render(<DateCarouselHarness />);

    const dateInput = await screen.findByRole('textbox', { name: 'Jump to date' }).catch(
      () => screen.getByLabelText('Jump to date'),
    );
    fireEvent.change(dateInput, { target: { value: '2030-02-03' } });

    await waitFor(() => expect((dateInput as HTMLInputElement).value).toBe('2030-02-03'));
    expect(await screen.findByRole('tab', { name: /February 3/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    await waitFor(() => expect((dateInput as HTMLInputElement).value).toBe(localDateKey(new Date())));
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
  });
});
