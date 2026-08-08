'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import LocationAutocomplete from '@/components/LocationAutocomplete';

type Accommodation = {
  id: string;
  trip_id: string;
  location_text: string;
  lat: number | null;
  lng: number | null;
  check_in_date: string;
  check_out_date: string;
};

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Writes this stay's location onto every trip_days row it covers
// (check-in date through check-out date inclusive) — this is what lets
// calculate-day keep reading base_lat/base_lng from trip_days unchanged,
// now populated from a stay instead of typed per day.
async function syncStayToDays(stay: { trip_id: string; location_text: string; lat: number | null; lng: number | null; check_in_date: string; check_out_date: string }) {
  await supabase
    .from('trip_days')
    .update({
      base_location_text: stay.location_text,
      base_lat: stay.lat,
      base_lng: stay.lng,
    })
    .eq('trip_id', stay.trip_id)
    .gte('date', stay.check_in_date)
    .lte('date', stay.check_out_date);
}

export default function AccommodationSheet(props: {
  tripId: string;
  onClose: () => void;
  onSynced: () => void; // parent refetches trip_days after any change
}) {
  const { tripId, onClose, onSynced } = props;
  const [stays, setStays] = useState<Accommodation[]>([]);
  const [adding, setAdding] = useState(false);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStays();
  }, [tripId]);

  async function loadStays() {
    const { data } = await supabase
      .from('accommodations')
      .select('*')
      .eq('trip_id', tripId)
      .order('check_in_date', { ascending: true });
    setStays(data || []);
  }

  async function saveStay() {
    if (location.trim().length === 0) {
      setError('Add a location');
      return;
    }
    if (!checkIn || !checkOut) {
      setError('Pick check-in and check-out dates');
      return;
    }
    if (checkOut < checkIn) {
      setError('Check-out is before check-in');
      return;
    }
    setError('');
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: stay, error: insertError } = await supabase
      .from('accommodations')
      .insert({
        trip_id: tripId,
        user_id: user?.id,
        location_text: location.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        check_in_date: checkIn,
        check_out_date: checkOut,
      })
      .select()
      .single();

    setSaving(false);
    if (insertError || !stay) {
      setError(insertError?.message || 'Could not save');
      return;
    }

    await syncStayToDays(stay);
    setLocation('');
    setCoords(null);
    setCheckIn('');
    setCheckOut('');
    setAdding(false);
    await loadStays();
    onSynced();
  }

  async function deleteStay(id: string) {
    await supabase.from('accommodations').delete().eq('id', id);
    await loadStays();
    // Note: this doesn't clear base fields already synced onto trip_days —
    // if you delete a stay, its days keep the last-known base until a new
    // stay covering those dates is saved (or you clear it manually via the
    // day view). Simple, predictable, avoids silently blanking a day's
    // plan mid-trip.
    onSynced();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet task-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <div className="settings-panel-title">Where you're staying</div>
          <button className="btn-text" onClick={onClose}>Close</button>
        </div>

        {stays.length === 0 && !adding && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No accommodation added yet.</p>
        )}

        <div className="priority-option-list">
          {stays.map((s) => (
            <div key={s.id} className="priority-option" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="priority-option-label">{s.location_text}</div>
                <div className="priority-option-description">{fmtDate(s.check_in_date)} – {fmtDate(s.check_out_date)}</div>
              </div>
              <button className="icon-btn" onClick={() => deleteStay(s.id)} aria-label="Remove stay">×</button>
            </div>
          ))}
        </div>

        {adding ? (
          <>
            <LocationAutocomplete
              value={location}
              placeholder="Hotel or accommodation"
              onChange={setLocation}
              onPlaceSelected={(result) => {
                setLocation(result.formattedAddress);
                setCoords({ lat: result.lat, lng: result.lng });
              }}
            />
            {location.length > 0 && !coords && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                Pick a suggestion so this can anchor drive-time calculations.
              </p>
            )}
            <div className="capture-row">
              <div style={{ flex: 1 }}>
                <span className="settings-label">Check-in</span>
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span className="settings-label">Check-out</span>
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn btn-steel" onClick={saveStay} disabled={saving}>
              {saving ? 'Saving…' : 'Save stay'}
            </button>
            <button className="btn-text" onClick={() => setAdding(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>+ Add accommodation</button>
        )}
      </div>
    </div>
  );
}
