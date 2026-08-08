'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
};

function fmtDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map((n) => parseInt(n, 10));
  const [ey, em, ed] = end.split('-').map((n) => parseInt(n, 10));
  const sDate = new Date(sy, sm - 1, sd);
  const eDate = new Date(ey, em - 1, ed);
  const sameYear = sy === ey;
  const startLabel = sDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = eDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function tripStatus(start: string, end: string, todayStr: string): 'upcoming' | 'active' | 'past' {
  if (todayStr < start) return 'upcoming';
  if (todayStr > end) return 'past';
  return 'active';
}

function daysBetween(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map((n) => parseInt(n, 10));
  const [ey, em, ed] = end.split('-').map((n) => parseInt(n, 10));
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  const out: string[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function TravelHome() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) loadTrips();
  }, [session]);

  async function loadTrips() {
    setLoading(true);
    const { data } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: true });
    setTrips(data || []);
    setLoading(false);
  }

  async function createTrip() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Give the trip a name');
      return;
    }
    if (!startDate || !endDate) {
      setError('Pick a start and end date');
      return;
    }
    if (endDate < startDate) {
      setError('End date is before the start date');
      return;
    }
    setError('');
    setSaving(true);

    const { data: tripRow, error: tripError } = await supabase
      .from('trips')
      .insert({
        user_id: session.user.id,
        name: trimmed,
        start_date: startDate,
        end_date: endDate,
      })
      .select()
      .single();

    if (tripError || !tripRow) {
      setError(tripError?.message || 'Could not create trip');
      setSaving(false);
      return;
    }

    // One trip_days row per calendar day in the range, default 08:00–20:00 —
    // matches Dokkit's default work_start/work_end pattern, just travel-scale.
    const dayDates = daysBetween(startDate, endDate);
    const dayRows = dayDates.map((date) => ({
      trip_id: tripRow.id,
      date,
      day_start: '08:00',
      day_end: '20:00',
    }));
    const { error: daysError } = await supabase.from('trip_days').insert(dayRows);

    setSaving(false);

    if (daysError) {
      alert(daysError.message);
      return;
    }

    setName('');
    setStartDate('');
    setEndDate('');
    setCreateOpen(false);
    router.push(`/travel/${tripRow.id}`);
  }

  async function deleteTrip(id: string) {
    if (!confirm('Delete this trip and everything planned in it?')) return;
    await supabase.from('trips').delete().eq('id', id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }

  if (!session) {
    return <div className="app-shell" style={{ paddingTop: 40 }}>Sign in to see your trips.</div>;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => tripStatus(t.start_date, t.end_date, todayStr) !== 'past');
  const past = trips.filter((t) => tripStatus(t.start_date, t.end_date, todayStr) === 'past');

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back">‹</button>
          <h1 className="app-title">Trips</h1>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : trips.length === 0 ? (
        <div className="empty-state">No trips yet.<br />Tap + to plan one.</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="task-list" style={{ marginTop: 'var(--space-4)' }}>
              {upcoming.map((t) => {
                const status = tripStatus(t.start_date, t.end_date, todayStr);
                return (
                  <div key={t.id} className="task-row">
                    <div className="swipe-zone">
                      <button
                        className="swipe-reveal-right start-stop-btn"
                        style={{ background: 'var(--danger)' }}
                        onClick={() => deleteTrip(t.id)}
                        aria-label="Delete trip"
                      >
                        <span>Delete</span>
                      </button>
                      <div
                        className="swipe-foreground"
                        onClick={() => router.push(`/travel/${t.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="task-main">
                          <div className="task-body">
                            <div className="task-text">{t.name}</div>
                            <div className="task-tags">
                              <span className="tag mono">{fmtDateRange(t.start_date, t.end_date)}</span>
                              {status === 'active' && <span className="tag tag-due">happening now</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {past.length > 0 && (
            <>
              <div className="settings-label" style={{ display: 'block', margin: 'var(--space-5) 0 var(--space-2)' }}>
                Past trips
              </div>
              <div className="task-list">
                {past.map((t) => (
                  <div key={t.id} className="task-row task-list-item">
                    <div className="swipe-zone">
                      <button
                        className="swipe-reveal-right start-stop-btn"
                        style={{ background: 'var(--danger)' }}
                        onClick={() => deleteTrip(t.id)}
                        aria-label="Delete trip"
                      >
                        <span>Delete</span>
                      </button>
                      <div
                        className="swipe-foreground"
                        onClick={() => router.push(`/travel/${t.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="task-main">
                          <div className="task-body">
                            <div className="task-text">{t.name}</div>
                            <div className="task-tags">
                              <span className="tag mono">{fmtDateRange(t.start_date, t.end_date)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {createOpen && (
        <div className="capture-sheet">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trip name (e.g. Gold Coast)"
          />
          <div className="capture-row">
            <div style={{ flex: 1 }}>
              <span className="settings-label">Start</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <span className="settings-label">End</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          <button className="btn btn-steel" onClick={createTrip} disabled={saving}>
            {saving ? 'Creating…' : 'Create trip'}
          </button>
          <button className="btn-text" onClick={() => setCreateOpen(false)}>Cancel</button>
        </div>
      )}

      {!createOpen && (
        <button className="capture-fab" onClick={() => setCreateOpen(true)} aria-label="New trip">+</button>
      )}
    </div>
  );
}
