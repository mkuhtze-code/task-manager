'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { CloseIcon, TrashIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type LibraryItem = {
  id: string;
  trip_id: string;
  name: string;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
};

type Props = {
  tripId: string;
  tripName: string;
  tripDays: { id: string; date: string }[];
  onClose: () => void;
  onScheduled: (tripDayId: string) => void;
};

function fmtDayLabel(dateStr: string): { weekday: string; date: string } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
    date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

// The trip's "big basket of goodies" — things we might want to do, held
// without any decision about when. Deliberately loose: no dates, times,
// estimates or status on a Library item; those only appear once it is
// scheduled into an activity (which copies name/location/coords and keeps
// library_item_id as pure provenance).
export default function LibrarySheet({ tripId, tripName, tripDays, onClose, onScheduled }: Props) {
  const dialogRef = useDialogA11y(onClose);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [mode, setMode] = useState<'list' | 'add' | 'edit' | 'schedule' | 'places'>('list');
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [scheduling, setScheduling] = useState<LibraryItem | null>(null);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The prediction text picked in the places-only flow, needed by the
  // place-details callback that fires after it.
  const placesNameRef = useRef('');

  useEffect(() => {
    loadItems();
  }, [tripId]);

  async function loadItems() {
    const { data } = await supabase
      .from('trip_library_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    setItems(data || []);
  }

  function resetForm() {
    setName('');
    setLocation('');
    setCoords(null);
    setNotes('');
    setError('');
  }

  function openAdd() {
    resetForm();
    setMode('add');
  }

  function openPlaces() {
    setLocation('');
    setCoords(null);
    setError('');
    placesNameRef.current = '';
    setMode('places');
  }

  function openEdit(item: LibraryItem) {
    setEditing(item);
    setName(item.name);
    setLocation(item.location_text || '');
    setCoords(item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null);
    setNotes(item.notes || '');
    setError('');
    setMode('edit');
  }

  function openSchedule(item: LibraryItem) {
    setScheduling(item);
    setError('');
    setMode('schedule');
  }

  // Auto-fill the name from a picked place only when the user hasn't typed
  // one themselves — searching for the location must never clobber a name
  // they deliberately wrote.
  function handlePlacePicked(text: string) {
    if (!name.trim()) setName(text);
  }

  async function saveItem() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give it a name');
      return;
    }
    setError('');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: trimmedName,
      location_text: location.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      notes: notes.trim() || null,
    };
    const result = editing
      ? await supabase.from('trip_library_items').update(payload).eq('id', editing.id)
      : await supabase.from('trip_library_items').insert({ trip_id: tripId, user_id: user?.id, ...payload });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEditing(null);
    resetForm();
    setMode('list');
    await loadItems();
  }

  async function savePlacesItem(nameText: string, address: string, lat: number | null, lng: number | null) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('trip_library_items').insert({
      trip_id: tripId,
      user_id: user?.id,
      name: nameText.trim() || location.trim() || 'Untitled place',
      location_text: address || null,
      lat,
      lng,
      notes: null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    placesNameRef.current = '';
    setLocation('');
    setCoords(null);
    setError('');
    setMode('list');
    await loadItems();
  }

  async function deleteEditingItem() {
    if (!editing) return;
    if (!confirm(`Delete "${editing.name}" from the library? It can't be undone.`)) return;
    const { error } = await supabase.from('trip_library_items').delete().eq('id', editing.id);
    if (error) {
      alert('Could not delete: ' + error.message);
      return;
    }
    setEditing(null);
    resetForm();
    setMode('list');
    await loadItems();
  }

  async function scheduleForDay(item: LibraryItem, dayId: string) {
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { data: maxRows } = await supabase
      .from('activities')
      .select('order_index')
      .eq('trip_day_id', dayId)
      .order('order_index', { ascending: false })
      .limit(1);
    const orderIndex = (maxRows && maxRows.length ? maxRows[0].order_index : 0) + 1;
    const { error } = await supabase.from('activities').insert({
      user_id: user?.id,
      trip_day_id: dayId,
      text: item.name,
      estimate_mins: 30,
      drive_mins_to_next: 0,
      location_text: item.location_text,
      lat: item.lat,
      lng: item.lng,
      order_index: orderIndex,
      time_type: 'flexible',
      fixed_time: null,
      library_item_id: item.id,
    });
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }
    onScheduled(dayId);
  }

  const addEditForm = (
    <>
      <span className="settings-label">Name</span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Tony's Italian"
        autoFocus
      />
      <LocationAutocomplete
        value={location}
        placeholder="Location (optional)"
        onChange={setLocation}
        onPlacePicked={(p) => handlePlacePicked(p.text)}
        onPlaceSelected={(result) => {
          setLocation(result.formattedAddress);
          setCoords({ lat: result.lat, lng: result.lng });
        }}
      />
      {location.length > 0 && !coords && (
        <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
          Pick a suggestion so it can anchor routing later.
        </p>
      )}
      <span className="settings-label">Notes</span>
      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
      <button className="btn btn-steel" onClick={saveItem} disabled={saving}>
        {saving ? 'Saving…' : editing ? 'Save' : 'Save to library'}
      </button>
      <button className="btn-text" onClick={() => { setEditing(null); setMode('list'); }}>Cancel</button>
    </>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Library">
        {mode === 'list' && (
          <>
            <div className="task-detail-header">
              <div className="settings-panel-title">Library</div>
              <button className="gear-btn" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <p className="settings-help">Ideas for {tripName}.</p>

            {items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">Save places and things you might want to do on this trip.</div>
                <div className="empty-state-sub">
                  No dates, no decisions — just ideas you can schedule onto a day later.
                </div>
                <div className="library-actions">
                  <button className="btn btn-steel" onClick={openAdd}>+ Add to library</button>
                  <button className="btn btn-ghost" onClick={openPlaces}>Search places</button>
                </div>
              </div>
            ) : (
              <>
                <div className="library-list">
                  {items.map((item) => (
                    <div key={item.id} className="library-row">
                      <button className="library-row-open" onClick={() => openEdit(item)}>
                        <span className="library-row-title">{item.name}</span>
                        {item.location_text && <span className="library-row-meta">{item.location_text}</span>}
                      </button>
                      <button className="btn-text" onClick={() => openSchedule(item)}>Schedule</button>
                    </div>
                  ))}
                </div>
                <div className="library-actions">
                  <button className="btn btn-ghost" onClick={openAdd}>+ Add to library</button>
                  <button className="btn btn-ghost" onClick={openPlaces}>Search places</button>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'places' && (
          <>
            <div className="task-detail-header">
              <div className="settings-panel-title">Search places</div>
              <button className="gear-btn" onClick={() => setMode('list')} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <p className="settings-help">Pick a place to save it to the library.</p>
            <LocationAutocomplete
              value={location}
              placeholder="Search places"
              onChange={setLocation}
              onPlacePicked={(p) => { placesNameRef.current = p.text; }}
              onPlaceSelected={(result) =>
                savePlacesItem(placesNameRef.current, result.formattedAddress, result.lat, result.lng)
              }
            />
            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn-text" onClick={() => setMode('list')}>Cancel</button>
          </>
        )}

        {(mode === 'add' || mode === 'edit') && (
          <>
            <div className="task-detail-header">
              <div className="settings-panel-title">{editing ? 'Library item' : 'Add to library'}</div>
              <button className="gear-btn" onClick={() => { setEditing(null); setMode('list'); }} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            {addEditForm}
            {mode === 'edit' && (
              <div className="detail-delete">
                <button
                  className="btn-text"
                  style={{ color: 'var(--danger-text, var(--danger))', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
                  onClick={deleteEditingItem}
                >
                  <TrashIcon /> Delete from library
                </button>
              </div>
            )}
          </>
        )}

        {mode === 'schedule' && scheduling && (
          <>
            <div className="task-detail-header">
              <div className="settings-panel-title">Schedule</div>
              <button className="gear-btn" onClick={() => setMode('list')} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <p className="nearby-context">{scheduling.name} — which day?</p>
            <div className="day-toggle-row" style={{ flexWrap: 'wrap', width: '100%' }}>
              {tripDays.map((d) => {
                const label = fmtDayLabel(d.date);
                return (
                  <button
                    key={d.id}
                    className="day-toggle-btn pill"
                    onClick={() => scheduleForDay(scheduling, d.id)}
                    disabled={saving}
                  >
                    {label.weekday} {label.date}
                  </button>
                );
              })}
            </div>
            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn-text" onClick={() => setMode('list')} disabled={saving}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
