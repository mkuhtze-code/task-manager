'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import TopSwitcher from '@/components/TopSwitcher';

type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

// Whole-day difference between two YYYY-MM-DD strings, computed from local
// midnight on both sides so DST/timezone edge cases don't shift the count
// by a day.
function dateDiffDays(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map((n) => parseInt(n, 10));
  const [ty, tm, td] = toStr.split('-').map((n) => parseInt(n, 10));
  const fromDate = new Date(fy, fm - 1, fd);
  const toDate = new Date(ty, tm - 1, td);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
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

  function closeCreate() {
    setCreateOpen(false);
    setError('');
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

  async function deleteTrip(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
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

  const heroTrip = upcoming.length > 0 ? upcoming[0] : null;
  const restUpcoming = upcoming.length > 1 ? upcoming.slice(1) : [];

  let heroStatus: 'upcoming' | 'active' | null = null;
  let heroEyebrow = '';
  let heroNumber = '';
  let heroLabel = '';
  if (heroTrip) {
    heroStatus = tripStatus(heroTrip.start_date, heroTrip.end_date, todayStr) as 'upcoming' | 'active';
    if (heroStatus === 'active') {
      const dayNum = dateDiffDays(heroTrip.start_date, todayStr) + 1;
      const totalDays = dateDiffDays(heroTrip.start_date, heroTrip.end_date) + 1;
      heroEyebrow = 'Happening now';
      heroNumber = String(dayNum);
      heroLabel = `of ${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
    } else {
      const days = dateDiffDays(todayStr, heroTrip.start_date);
      heroEyebrow = 'Next trip';
      heroNumber = String(days);
      heroLabel = days === 1 ? 'day to go' : 'days to go';
    }
  }

  return (
    <div className="app-shell">
      <TopSwitcher active="travel" />

      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back">‹</button>
          <h1 className="app-title">Trips</h1>
        </div>
        <div className="app-header-right">
          <GearMenu context="travel" />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : trips.length === 0 ? (
        <div className="trip-empty-state">
          <div className="trip-empty-title">Where to next?</div>
          <p className="trip-empty-sub">
            Add a trip, block out your days, and Dokkit will help you work out<br />what actually fits.
          </p>
          <button className="btn btn-steel" onClick={() => setCreateOpen(true)}>Plan a trip</button>
        </div>
      ) : (
        <>
          {heroTrip && (
            <div className="trip-hero-card" onClick={() => router.push(`/travel/${heroTrip.id}`)}>
              <div className="trip-hero-eyebrow">{heroEyebrow}</div>
              <div className="trip-hero-name">{heroTrip.name}</div>
              <div className="trip-hero-countdown-row">
                <span className="trip-hero-countdown-number mono">{heroNumber}</span>
                <span className="trip-hero-countdown-label">{heroLabel}</span>
              </div>
              <div className="trip-hero-dates">{fmtDateRange(heroTrip.start_date, heroTrip.end_date)}</div>
            </div>
          )}

          {restUpcoming.length > 0 && (
            <>
              <div className="trip-section-label">More upcoming</div>
              {restUpcoming.map((t) => {
                const days = dateDiffDays(todayStr, t.start_date);
                return (
                  <div key={t.id} className="trip-card" onClick={() => router.push(`/travel/${t.id}`)}>
                    <div className="trip-card-body">
                      <div className="trip-card-eyebrow">{days === 1 ? 'In 1 day' : `In ${days} days`}</div>
                      <div className="trip-card-name">{t.name}</div>
                      <div className="trip-card-dates">{fmtDateRange(t.start_date, t.end_date)}</div>
                    </div>
                    <button className="trip-card-delete" onClick={(e) => deleteTrip(t.id, e)} aria-label="Delete trip">
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {past.length > 0 && (
            <>
              <div className="trip-section-label">Past trips</div>
              {past.map((t) => (
                <div key={t.id} className="trip-card past" onClick={() => router.push(`/travel/${t.id}`)}>
                  <div className="trip-card-body">
                    <div className="trip-card-eyebrow">Completed</div>
                    <div className="trip-card-name">{t.name}</div>
                    <div className="trip-card-dates">{fmtDateRange(t.start_date, t.end_date)}</div>
                  </div>
                  <button className="trip-card-delete" onClick={(e) => deleteTrip(t.id, e)} aria-label="Delete trip">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {createOpen && (
        <div className="capture-sheet">
          <div className="task-detail-header" style={{ marginBottom: 0 }}>
            <div className="settings-panel-title">New trip</div>
            <button className="gear-btn" onClick={closeCreate} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
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
        </div>
      )}

      {trips.length > 0 && !createOpen && (
        <button className="capture-fab" onClick={() => setCreateOpen(true)} aria-label="New trip">+</button>
      )}
    </div>
  );
}
