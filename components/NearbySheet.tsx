'use client';

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

export default function NearbySheet(props: {
  loading: boolean;
  suggestions: NearbySuggestion[];
  onClose: () => void;
  onPick: (s: NearbySuggestion) => void;
}) {
  const { loading, suggestions, onClose, onPick } = props;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">On the way</div>
          <button className="btn-text" onClick={onClose}>Close</button>
        </div>

        {loading && <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Checking real drive times…</p>}

        {!loading && suggestions.length === 0 && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Nothing worth a detour found near this drive.</p>
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
