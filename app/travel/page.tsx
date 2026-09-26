'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import { BackIcon, ChevronIcon, CloseIcon, TrashIcon } from '@/components/icons';
import SurfaceNav from '@/components/SurfaceNav';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import ProPlanGate from '@/components/ProPlanGate';

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
  const endLabel = eDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

function tripStatus(start: string, end: string, todayStr: string): 'upcoming' | 'active' | 'past' {
  if (todayStr < start) return 'upcoming';
  if (todayStr > end) return 'past';
  return 'active';
}

function dateDiffDays(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map((n) => parseInt(n, 10));
  const [ty, tm, td] = toStr.split('-').map((n) => parseInt(n, 10));
  const fromDate = new Date(fy, fm - 1, fd);
  const toDate = new Date(ty, tm - 1, td);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const recordEvent = useRecordSurfaceEvent();
  const { isDesktop } = useSurfaceMode();
  const { entitlements, loading: entLoading } = useEntitlements(session?.user?.id);
  const canTravel = entitlements.canUseTravel;

  const [createOpen, setCreateOpen] = useState(false);
  const [tripIntent, setTripIntent] = useState<'personal' | 'work'>('personal');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [listFilter, setListFilter] = useState<'active' | 'upcoming' | 'past' | 'all'>('all');

  useEffect(() => {
    if (!isDesktop || !canTravel) return;
    return registerDesktopPrimaryAction('Plan a trip', () => openCreate());
  }, [isDesktop, canTravel]);

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

  function openCreate() {
    const today = localDateStr(new Date());
    if (!startDate) setStartDate(today);
    if (!endDate) {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      setEndDate(localDateStr(d));
    }
    setTripIntent('personal');
    setError('');
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setError('');
  }

  function applyDatePreset(preset: 'today' | 'weekend' | 'week') {
    const now = new Date();
    const today = localDateStr(now);
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (preset === 'weekend') {
      // Next Sat–Sun (or this weekend if still before Sunday)
      const day = now.getDay(); // 0 Sun
      const toSat = day === 0 ? -1 : 6 - day;
      const sat = new Date(now);
      sat.setDate(now.getDate() + toSat);
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);
      setStartDate(localDateStr(sat));
      setEndDate(localDateStr(sun));
      return;
    }
    // Next 7 days from today
    const end = new Date(now);
    end.setDate(now.getDate() + 6);
    setStartDate(today);
    setEndDate(localDateStr(end));
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

    const dayDates = daysBetween(startDate, endDate);
    const dayStart = tripIntent === 'work' ? '07:30' : '08:00';
    const dayEnd = tripIntent === 'work' ? '17:00' : '20:00';
    const dayRows = dayDates.map((date) => ({
      trip_id: tripRow.id,
      date,
      day_start: dayStart,
      day_end: dayEnd,
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
    setTripIntent('personal');
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

  const todayStr = localDateStr(new Date());
  const active = trips.filter((t) => tripStatus(t.start_date, t.end_date, todayStr) === 'active');
  const upcomingOnly = trips.filter((t) => tripStatus(t.start_date, t.end_date, todayStr) === 'upcoming');
  const past = trips.filter((t) => tripStatus(t.start_date, t.end_date, todayStr) === 'past');
  const upcoming = [...active, ...upcomingOnly];

  const heroTrip = active[0] || upcomingOnly[0] || null;
  const restUpcoming = upcoming.filter((t) => t.id !== heroTrip?.id);

  let leadPill = '';
  if (heroTrip) {
    if (tripStatus(heroTrip.start_date, heroTrip.end_date, todayStr) === 'active') {
      const dayNum = dateDiffDays(heroTrip.start_date, todayStr) + 1;
      const totalDays = dateDiffDays(heroTrip.start_date, heroTrip.end_date) + 1;
      leadPill = `Day ${dayNum} of ${totalDays}`;
    } else {
      const days = dateDiffDays(todayStr, heroTrip.start_date);
      leadPill = days === 1 ? 'In 1 day' : `In ${days} days`;
    }
  }

  if (!entLoading && session && !canTravel) {
    return (
      <div className="app-shell">
        <div className="app-header">
          <div className="app-header-left">
            <h1 className="app-title">Travel</h1>
          </div>
        </div>
        <ProPlanGate feature="travel" />
        <SurfaceNav active="travel" />
      </div>
    );
  }


  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back">
            <BackIcon />
          </button>
          <h1 className="app-title">Trips</h1>
        </div>
        <div className="app-header-right">
          <GearMenu context="travel" userId={session?.user.id ?? null} />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : trips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Where to next?</div>
          <div className="empty-state-sub">
            Add a trip, block out the days, and Dokkit works out what actually fits.
          </div>
          <button className="btn btn-steel" onClick={() => openCreate()}>
            Plan a trip
          </button>
        </div>
      ) : (
        <>
          <div
            className="travel-filter-row job-list-filter-sticky"
            style={{
              display: 'flex',
              gap: 8,
              padding: '8px var(--space-page, 16px) 10px',
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                { key: 'all' as const, label: `All · ${trips.length}` },
                { key: 'active' as const, label: `Active${active.length ? ` · ${active.length}` : ''}` },
                { key: 'upcoming' as const, label: `Upcoming${upcomingOnly.length ? ` · ${upcomingOnly.length}` : ''}` },
                { key: 'past' as const, label: `Past${past.length ? ` · ${past.length}` : ''}` },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={listFilter === key ? 'segmented-btn active' : 'segmented-btn'}
                style={{ minHeight: 32, fontSize: 12, padding: '0 12px' }}
                onClick={() => setListFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {(listFilter === 'all' || listFilter === 'active' || listFilter === 'upcoming') &&
            heroTrip &&
            (listFilter === 'all' ||
              tripStatus(heroTrip.start_date, heroTrip.end_date, todayStr) === listFilter) && (
            <div className="trip-lead" onClick={() => router.push(`/travel/${heroTrip.id}`)}>
              <div className="trip-lead-top">
                <span className="trip-lead-name">{heroTrip.name}</span>
                <span className="trip-lead-right">
                  <span className="trip-lead-pill">{leadPill}</span>
                  <span className="trip-lead-chev" aria-hidden="true">
                    <ChevronIcon size={14} />
                  </span>
                </span>
              </div>
              <div className="trip-lead-bottom">
                <span className="trip-lead-dates">
                  {fmtDateRange(heroTrip.start_date, heroTrip.end_date)}
                </span>
                <button
                  className="trip-card-delete"
                  onClick={(e) => deleteTrip(heroTrip.id, e)}
                  aria-label="Delete trip"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          )}

          {(listFilter === 'all' || listFilter === 'active' || listFilter === 'upcoming') &&
            restUpcoming.filter(
              (tr) =>
                listFilter === 'all' ||
                tripStatus(tr.start_date, tr.end_date, todayStr) === listFilter
            ).length > 0 && (
            <div className="trip-list">
              {restUpcoming
                .filter(
                  (tr) =>
                    listFilter === 'all' ||
                    tripStatus(tr.start_date, tr.end_date, todayStr) === listFilter
                )
                .map((tr) => (
                <div key={tr.id} className="trip-row" onClick={() => router.push(`/travel/${tr.id}`)}>
                  <span className="trip-row-name">{tr.name}</span>
                  <span className="trip-row-dates">{fmtDateRange(tr.start_date, tr.end_date)}</span>
                  <button
                    className="trip-card-delete"
                    onClick={(e) => deleteTrip(tr.id, e)}
                    aria-label="Delete trip"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(listFilter === 'all' || listFilter === 'past') && past.length > 0 && (
            <>
              {listFilter === 'all' ? (
                <button
                  className="trip-past-toggle"
                  onClick={() => setPastOpen((v) => !v)}
                  aria-expanded={pastOpen}
                >
                  <span>Past trips · {past.length}</span>
                  <ChevronIcon size={14} />
                </button>
              ) : null}
              {(listFilter === 'past' || pastOpen) && (
                <div className="trip-list">
                  {past.map((tr) => (
                    <div
                      key={tr.id}
                      className="trip-row past"
                      onClick={() => router.push(`/travel/${tr.id}`)}
                    >
                      <span className="trip-row-name">{tr.name}</span>
                      <span className="trip-row-dates">{fmtDateRange(tr.start_date, tr.end_date)}</span>
                      <button
                        className="trip-card-delete"
                        onClick={(e) => deleteTrip(tr.id, e)}
                        aria-label="Delete trip"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {createOpen && (
        <div className="sheet-backdrop" onClick={closeCreate}>
          <div className="capture-sheet new-trip-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="task-detail-header" style={{ marginBottom: 0 }}>
              <div className="settings-panel-title">New trip</div>
              <button className="gear-btn" onClick={closeCreate} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <p className="job-detail-kicker" style={{ marginBottom: 4 }}>
              {tripIntent === 'work' ? 'Work trip' : 'Personal trip'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.4 }}>
              {tripIntent === 'work'
                ? 'Site days and job stops — add work sites after you create.'
                : 'Places and days — add stops when you are ready.'}
            </p>

            <span className="settings-label">What kind?</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                className={tripIntent === 'personal' ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
                onClick={() => setTripIntent('personal')}
              >
                Personal
              </button>
              <button
                type="button"
                className={tripIntent === 'work' ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
                onClick={() => setTripIntent('work')}
              >
                Work
              </button>
            </div>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                tripIntent === 'work' ? 'e.g. Kinloch site week' : 'e.g. Gold Coast'
              }
              autoFocus
            />

            <span className="settings-label">Dates</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <button type="button" className="meeting-pill" onClick={() => applyDatePreset('today')}>
                Today
              </button>
              <button type="button" className="meeting-pill" onClick={() => applyDatePreset('weekend')}>
                Weekend
              </button>
              <button type="button" className="meeting-pill" onClick={() => applyDatePreset('week')}>
                7 days
              </button>
            </div>
            <div className="capture-row">
              <div style={{ flex: 1 }}>
                <span className="settings-label">Start</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span className="settings-label">End</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {startDate && endDate && endDate >= startDate && (
              <div className="stop-context-strip" style={{ marginTop: 4 }}>
                <div className="stop-context-line">
                  <span className="stop-context-kicker">Ready</span>
                  <span>
                    {daysBetween(startDate, endDate).length} day
                    {daysBetween(startDate, endDate).length === 1 ? '' : 's'}
                    {tripIntent === 'work'
                      ? ' · work-day hours (07:30–17:00)'
                      : ' · open hours (08:00–20:00)'}
                    {' · add stops next'}
                  </span>
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button className="btn btn-steel" onClick={createTrip} disabled={saving}>
              {saving ? 'Creating…' : 'Create trip'}
            </button>
          </div>
        </div>
      )}

      <SurfaceNav
        active="travel"
        onNavigate={(s) => recordEvent(s, true)}
        onAdd={!createOpen && trips.length > 0 ? () => openCreate() : undefined}
        addLabel="New trip"
      />
    </div>
  );
}
