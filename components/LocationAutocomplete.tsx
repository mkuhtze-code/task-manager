'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Prediction = { placeId: string; text: string };

export default function LocationAutocomplete(props: {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onPlaceSelected: (result: { lat: number; lng: number; formattedAddress: string }) => void;
  // Fires the moment a prediction is picked, before the place-details
  // fetch resolves — lets a caller capture the prediction text (the
  // "name" of the place) without waiting for coordinates.
  onPlacePicked?: (place: { placeId: string; text: string }) => void;
}) {
  const { value, placeholder, onChange, onPlaceSelected, onPlacePicked } = props;
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectError, setSelectError] = useState('');

  // A session starts the moment typing begins and is discarded once a
  // place is picked (or the field is abandoned) — never reused across
  // separate lookups, since reusing a token past its session defeats the
  // billing grouping it's meant to provide.
  function ensureSessionToken() {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return sessionTokenRef.current;
  }

  async function authedFetch(url: string, body: any) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  function handleInputChange(text: string) {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authedFetch('/app/api/travel/autocomplete', {
          input: text,
          sessionToken: ensureSessionToken(),
        });
        const json = await res.json();
        setPredictions(json.predictions || []);
        setOpen(true);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  async function handleSelect(p: Prediction) {
    setOpen(false);
    onChange(p.text);
    onPlacePicked?.({ placeId: p.placeId, text: p.text });
    setLoading(true);
    setSelectError('');
    try {
      const res = await authedFetch('/app/api/travel/place-details', {
        placeId: p.placeId,
        sessionToken: sessionTokenRef.current,
      });
      const json = await res.json();
      if (json.lat != null && json.lng != null) {
        onPlaceSelected({ lat: json.lat, lng: json.lng, formattedAddress: json.formattedAddress });
      } else {
        setSelectError("Couldn't pin down that location — drive time won't be calculated for it.");
      }
    } catch {
      setSelectError('Could not reach the server — try again.');
    } finally {
      sessionTokenRef.current = '';
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        placeholder={placeholder || 'Search for a place'}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && predictions.length > 0 && (
        <div
          className="gear-dropdown"
          style={{ top: '100%', left: 0, right: 0, width: 'auto', marginTop: 4 }}
        >
          {predictions.map((p) => (
            <button
              key={p.placeId}
              type="button"
              className="gear-dropdown-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(p)}
            >
              {p.text}
            </button>
          ))}
        </div>
      )}
      {loading && (
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--ink-faint)' }}>
          …
        </span>
      )}
      {selectError && (
        <p style={{ fontSize: 11, color: 'var(--danger-text, var(--danger))', margin: '4px 0 0' }}>
          {selectError}
        </p>
      )}
    </div>
  );
}
