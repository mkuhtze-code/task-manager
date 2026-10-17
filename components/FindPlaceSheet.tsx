'use client';

import { useEffect, useRef, useState } from 'react';
import { authedFetch } from '@/lib/authedFetch';
import { buildGoogleMapsDirectionsUrl } from '@/lib/travel/driveLegs';
import { buildPlaceAutocompletePayload, buildPlaceBias, type PlaceBiasContexts, type PlaceBiasMode } from '@/lib/travel/placeSearch';
import { CloseIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type Prediction = { placeId: string; text: string; mainText?: string; secondaryText?: string; distanceMeters?: number | null };
type PickedPlace = { name: string; address: string; lat: number; lng: number };
type Props = {
  onClose: () => void;
  onAddStop: (place: PickedPlace, insertIndex: number | null) => Promise<void> | void;
  contexts: PlaceBiasContexts;
  initialBias?: PlaceBiasMode;
  insertIndex?: number | null;
  contextLabel?: string;
  remainingMins?: number | null;
};
const BIASES: { value: PlaceBiasMode; label: string }[] = [
  { value: 'here', label: 'Here' }, { value: 'stay', label: 'Stay' }, { value: 'stop', label: 'Stop' },
  { value: 'leg', label: 'Leg' }, { value: 'next', label: 'Next' },
];
const CATEGORIES = [
  { label: 'Any', types: [] as string[] }, { label: 'Food', types: ['restaurant', 'cafe', 'bakery'] },
  { label: 'Supplies', types: ['hardware_store', 'supermarket'] }, { label: 'Fuel', types: ['gas_station'] },
  { label: 'Stay', types: ['lodging'] }, { label: 'Places', types: ['tourist_attraction', 'museum', 'park'] },
];
function formatDistance(meters?: number | null) {
  if (meters == null || !Number.isFinite(meters)) return null;
  return meters >= 1000 ? `~${(meters / 1000).toFixed(1)} km away` : `~${Math.round(meters / 50) * 50} m away`;
}
export default function FindPlaceSheet({ onClose, onAddStop, contexts, initialBias = 'stay', insertIndex = null, contextLabel, remainingMins }: Props) {
  const dialogRef = useDialogA11y(onClose);
  const [query, setQuery] = useState('');
  const [biasMode, setBiasMode] = useState<PlaceBiasMode>(initialBias);
  const [category, setCategory] = useState(0);
  const [results, setResults] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const token = useRef('');
  const bias = buildPlaceBias(biasMode, contexts);
  const hasBias = bias.biasLat != null && bias.biasLng != null;
  const biasLat = bias.biasLat;
  const biasLng = bias.biasLng;
  const radiusMeters = bias.radiusMeters;
  const biasKey = `${biasMode}:${biasLat ?? ''}:${biasLng ?? ''}:${category}`;

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        if (!token.current) token.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const json = await authedFetch('/api/travel/autocomplete', buildPlaceAutocompletePayload(query.trim(), token.current, { biasLat, biasLng, radiusMeters }, CATEGORIES[category].types));
        if (cancelled) return;
        setResults((json.predictions || []) as Prediction[]);
        if (json.error) setError('Place search unavailable');
      } catch { if (!cancelled) { setResults([]); setError('Could not search places'); } }
      finally { if (!cancelled) setLoading(false); }
    }, 260);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, biasKey, biasLat, biasLng, radiusMeters, category]);

  async function addPlace(place: Prediction) {
    setAddingId(place.placeId); setError('');
    try {
      const json = await authedFetch('/api/travel/place-details', { placeId: place.placeId, sessionToken: token.current });
      if (json.lat == null || json.lng == null) throw new Error('Could not resolve that place');
      token.current = '';
      await onAddStop({ name: place.mainText || place.text, address: json.formattedAddress || place.text, lat: json.lat, lng: json.lng }, insertIndex);
    } catch { setError('Could not add this place. Try another result.'); }
    finally { setAddingId(null); }
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <section ref={dialogRef} className="capture-sheet task-detail-sheet find-place-sheet" role="dialog" aria-modal="true" aria-label="Find a place" onClick={(e) => e.stopPropagation()}>
      <div className="task-detail-header"><div className="settings-panel-title">Find place</div><button type="button" className="gear-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
      {contextLabel && <p className="find-place-context">{contextLabel}</p>}
      <label className="settings-label" htmlFor="find-place-query">Place or address</label>
      <input id="find-place-query" className="task-detail-name" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search near your trip context" autoComplete="off" />
      <div className="find-place-bias" aria-label="Search area">
        {BIASES.map((item) => {
          const available = !!contexts[item.value];
          return <button type="button" key={item.value} disabled={!available} aria-pressed={biasMode === item.value} className={biasMode === item.value ? 'day-toggle-btn pill active' : 'day-toggle-btn pill'} onClick={() => setBiasMode(item.value)}>{item.label}</button>;
        })}
      </div>
      {!hasBias && <p className="find-place-note">No mapped location for this area yet. Search remains unbiased; Here is available only when the parent supplies your location.</p>}
      <div className="find-place-categories" aria-label="Place category">
        {CATEGORIES.map((item, i) => <button type="button" key={item.label} className={category === i ? 'day-toggle-btn pill active' : 'day-toggle-btn pill'} aria-pressed={category === i} onClick={() => setCategory(i)}>{item.label}</button>)}
      </div>
      {loading && <p className="settings-help">Searching places…</p>}
      {error && <p role="alert" className="find-place-error">{error}</p>}
      {!loading && query.trim().length >= 2 && results.length === 0 && !error && <p className="settings-help">No matching places.</p>}
      <div className="find-place-results">{results.map((place) => {
        const directions = buildGoogleMapsDirectionsUrl({ lat: null, lng: null, locationText: place.text, label: place.mainText });
        return <article className="find-place-result" key={place.placeId}>
          <div className="find-place-result-copy"><strong>{place.mainText || place.text}</strong>{place.secondaryText && <span>{place.secondaryText}</span>}{formatDistance(place.distanceMeters) && <small>{formatDistance(place.distanceMeters)}</small>}{remainingMins != null && <small>Day window remaining: {Math.max(0, Math.round(remainingMins))} min</small>}</div>
          <div className="find-place-result-actions"><button type="button" className="btn btn-steel" disabled={addingId !== null} onClick={() => void addPlace(place)}>{addingId === place.placeId ? 'Adding…' : 'Add stop'}</button>{directions && <a className="find-place-directions" href={directions} target="_blank" rel="noreferrer">Directions</a>}</div>
        </article>;
      })}</div>
    </section>
  </div>;
}
