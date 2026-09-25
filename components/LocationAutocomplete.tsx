'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { authedFetch } from '@/lib/authedFetch';

type Prediction = {
  placeId: string;
  text: string;
  mainText?: string;
  secondaryText?: string;
};

export default function LocationAutocomplete(props: {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onPlaceSelected: (result: { lat: number; lng: number; formattedAddress: string }) => void;
  /** Fires when a prediction is chosen, before place-details resolves. */
  onPlacePicked?: (place: { placeId: string; text: string }) => void;
  /** Quiet context under the field, e.g. "Used for drive times". */
  hint?: string;
  /** Accessible name when no visible label wraps the field. */
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
}) {
  const {
    value,
    placeholder = 'Search for a place',
    onChange,
    onPlaceSelected,
    onPlacePicked,
    hint,
    disabled,
  } = props;
  const listId = useId();
  const inputId = props.id ?? listId;

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selectError, setSelectError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const sessionTokenRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function ensureSessionToken() {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return sessionTokenRef.current;
  }

  function resetSessionToken() {
    sessionTokenRef.current = '';
  }

  const closeList = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closeList();
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [closeList]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleInputChange(text: string) {
    onChange(text);
    setSelectError('');
    setListError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setPredictions([]);
      closeList();
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setListError('');
      try {
        const json = await authedFetch('/api/travel/autocomplete', {
          input: text,
          sessionToken: ensureSessionToken(),
        });
        const next: Prediction[] = json.predictions || [];
        setPredictions(next);
        setOpen(true);
        setActiveIndex(next.length ? 0 : -1);
        if (json.error && next.length === 0) {
          setListError('Place search unavailable');
        }
      } catch {
        setPredictions([]);
        setOpen(true);
        setActiveIndex(-1);
        setListError('Could not search places');
      } finally {
        setLoading(false);
      }
    }, 280);
  }

  async function handleSelect(p: Prediction) {
    closeList();
    onChange(p.text);
    onPlacePicked?.({ placeId: p.placeId, text: p.text });
    setLoading(true);
    setSelectError('');
    try {
      const json = await authedFetch('/api/travel/place-details', {
        placeId: p.placeId,
        sessionToken: sessionTokenRef.current || ensureSessionToken(),
      });
      resetSessionToken();
      if (json.lat == null || json.lng == null) {
        setSelectError('Could not resolve that place');
        return;
      }
      onPlaceSelected({
        lat: json.lat,
        lng: json.lng,
        formattedAddress: json.formattedAddress || p.text,
      });
      if (json.formattedAddress) onChange(json.formattedAddress);
    } catch {
      setSelectError('Could not resolve that place');
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && predictions.length) {
      setOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!open) {
      if (e.key === 'Escape') closeList();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = i < predictions.length - 1 ? i + 1 : 0;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = i > 0 ? i - 1 : predictions.length - 1;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter' && activeIndex >= 0 && predictions[activeIndex]) {
      e.preventDefault();
      void handleSelect(predictions[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
    }
  }

  function scrollOptionIntoView(index: number) {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }

  const showList = open && (predictions.length > 0 || loading || !!listError);
  const activeDesc =
    activeIndex >= 0 && predictions[activeIndex]
      ? `${listId}-opt-${predictions[activeIndex].placeId}`
      : undefined;

  return (
    <div className="place-field" ref={wrapRef}>
      <div className="place-field-control">
        <input
          id={inputId}
          type="text"
          className="place-field-input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-label={props['aria-label'] ?? placeholder}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeDesc}
          aria-busy={loading}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (predictions.length > 0 || listError) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {loading && (
          <span className="place-field-status" aria-hidden="true">
            …
          </span>
        )}
      </div>

      {hint && !selectError && <p className="place-field-hint">{hint}</p>}

      {showList && (
        <ul
          id={listId}
          ref={listRef}
          className="place-field-list"
          role="listbox"
          aria-label="Places"
        >
          {listError && predictions.length === 0 && (
            <li className="place-field-empty" role="presentation">
              {listError}
            </li>
          )}
          {!listError && !loading && predictions.length === 0 && (
            <li className="place-field-empty" role="presentation">
              No matching places
            </li>
          )}
          {predictions.map((p, index) => {
            const main = p.mainText || p.text;
            const secondary = p.secondaryText || '';
            const active = index === activeIndex;
            return (
              <li
                key={p.placeId}
                id={`${listId}-opt-${p.placeId}`}
                role="option"
                aria-selected={active}
                className={`place-field-option${active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void handleSelect(p)}
              >
                <span className="place-field-option-main">{main}</span>
                {secondary ? (
                  <span className="place-field-option-secondary">{secondary}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {selectError && (
        <p className="place-field-error" role="alert">
          {selectError}
        </p>
      )}
    </div>
  );
}
