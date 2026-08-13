'use client';

import { CloseIcon } from '@/components/icons';

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export type NearbySuggestion = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  typeLabel: string | null;
  detourMins: number;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'attraction', label: 'Attractions' },
  { value: 'food', label: 'Food' },
  { value: 'rest_stop', label: 'Rest stop' },
  { value: 'lookout', label: 'Lookout' },
  { value: 'supplies', label: 'Supplies' },
];

export default function NearbySheet(props: {
  loading: boolean;
  error?: string | null;
  suggestions: NearbySuggestion[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onClose: () => void;
  onPick: (s: NearbySuggestion) => void;
}) {
  const { loading, error, suggestions, selectedCategory, onCategoryChange, onClose, onPick } = props;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">On the way</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="day-toggle-row" style={{ overflowX: 'auto', width: '100%' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              className={c.value === selectedCategory ? 'day-toggle-btn pill active' : 'day-toggle-btn pill'}
              onClick={() => onCategoryChange(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading && <p className="settings-help">Checking real drive times…</p>}

        {!loading && error && (
          <p className="settings-help" style={{ color: 'var(--danger-text, var(--danger))' }}>
            Search failed: {error}
          </p>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <p className="settings-help">Nothing worth a detour found near this drive.</p>
        )}

        <div className="priority-option-list">
          {suggestions.map((s) => (
            <button key={s.placeId} className="priority-option" onClick={() => onPick(s)}>
              <span className="priority-option-label">{s.name}</span>
              <span className="priority-option-description">
                {s.typeLabel ? `${s.typeLabel} · ` : ''}
                {s.detourMins === 0 ? 'Basically on the way' : `+${fmtMins(s.detourMins)} detour`}
                {s.rating ? ` · ★${s.rating}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
