'use client';

import { useEffect, useState } from 'react';

type Props = {
  startDate: string;
  endDate: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (startDate: string, endDate: string) => Promise<void>;
};

export default function TripDateRangeEditor({ startDate, endDate, saving, onCancel, onSave }: Props) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [error, setError] = useState('');

  useEffect(() => {
    setStart(startDate);
    setEnd(endDate);
  }, [startDate, endDate]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        if (!start || !end || start > end) {
          setError('End date must be on or after start date.');
          return;
        }
        try {
          await onSave(start, end);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save trip dates.');
        }
      }}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', background: 'var(--paper)' }}
    >
      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
        Starts
        <input type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
        Ends
        <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required />
      </label>
      {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--danger, #a33)', fontSize: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="meeting-pill" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="meeting-pill meeting-pill--primary" disabled={saving}>{saving ? 'Saving…' : 'Save dates'}</button>
      </div>
    </form>
  );
}
