// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TodayFixedCommitments } from '@/components/today/TodayFixedCommitments';

afterEach(() => cleanup());

describe('Today fixed commitments', () => {
  it('renders fixed commitments chronologically before flexible work', () => {
    render(
      <TodayFixedCommitments
        commitments={[
          { id: 'later', title: 'Site visit', start_at: '2026-10-15T13:00:00', end_at: '2026-10-15T14:30:00', all_day: false },
          { id: 'early', title: 'Project review', start_at: '2026-10-15T10:00:00', end_at: '2026-10-15T10:30:00', all_day: false },
        ]}
      />,
    );

    const list = screen.getByRole('list');
    const rows = Array.from(list.querySelectorAll('li'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Project review');
    expect(rows[0].textContent).toContain('30m');
    expect(rows[1].textContent).toContain('Site visit');
    expect(rows[1].textContent).toContain('1h 30m');
  });

  it('does not add an empty commitments block', () => {
    const { container } = render(<TodayFixedCommitments commitments={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
