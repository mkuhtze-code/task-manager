'use client';

/**
 * Travel overview — Pro / Maybach surface.
 * Same tone as Today & Meetings; intelligence is movement → what fits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import SurfaceHeaderIdentity from '@/components/SurfaceHeaderIdentity';
import { CloseIcon, TrashIcon } from '@/components/icons';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import SurfaceDateCarousel from '@/components/SurfaceDateCarousel';
import TripObjectLink from '@/components/TripObjectLink';
import DesktopTravelHeader, {
  type TravelListFilter,
} from '@/components/DesktopTravelHeader';
import { useSurfaceReturnState } from '@/hooks/useSurfaceReturnState';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import {
  buildTravelSurfaceModel,
  fmtDateRange,
  localDateStr,
  type TripLike,
} from '@/lib/travel/travelSurface';

type Trip = TripLike & { created_at: string };

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
  const [stopCountByTrip, setStopCountByTrip] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);

  const { isDesktop } = useSurfaceMode();
  const { entitlements, loading: entLoading } = useEntitlements(
    session?.user?.id
  );
  const canTravel = entitlements.canUseTravel;

  useProRedirect(!entLoading && Boolean(session), canTravel, 'travel');

  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!canTravel) return;
    return registerDesktopPrimaryAction('Plan trip', () => {
    const today = localDateStr(new Date());
    setStartDate((current) => current || today);
    setEndDate((current) => {
      if (current) return current;
      const end = new Date();
      end.setDate(end.getDate() + 2);
      return localDateStr(end);
    });
    setTripIntent('work');
    setError('');
    setCreateOpen(true);
    });
  }, [canTravel]);
  const createDialogRef = useDialogA11y(() => setCreateOpen(false));
  const [tripIntent, setTripIntent] = useState<'personal' | 'work'>(
    'work'
  );
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] = useState<TravelListFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useSurfaceReturnState(
    session?.user?.id ? `dokkit.surface-return.${session.user.id}.travel.v1` : null,
    { listFilter, search, selectedDate },
    (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (
        saved.listFilter === 'active' ||
        saved.listFilter === 'upcoming' ||
        saved.listFilter === 'past' ||
        saved.listFilter === 'all'
      ) {
        setListFilter(saved.listFilter);
      }
      if (typeof saved.search === 'string') setSearch(saved.search);
      if (
        saved.selectedDate === null ||
        (typeof saved.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.selectedDate))
      ) {
        setSelectedDate(saved.selectedDate);
      }
    },
    !loading,
  );

  const todayStr = localDateStr(new Date());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: true });

    const list = (data as Trip[]) || [];
    setTrips(list);

    const counts: Record<string, number> = {};
    if (list.length > 0) {
      try {
        const ids = list.map((t) => t.id);
        const { data: dayRows } = await supabase
          .from('trip_days')
          .select('id, trip_id')
          .in('trip_id', ids);
        if (dayRows && dayRows.length > 0) {
          const dayIds = dayRows.map((d: { id: string }) => d.id);
          const tripByDay = new Map(
            dayRows.map((d: { id: string; trip_id: string }) => [
              d.id,
              d.trip_id,
            ])
          );
          const { data: acts } = await supabase
            .from('activities')
            .select('trip_day_id')
            .in('trip_day_id', dayIds);
          if (acts) {
            for (const a of acts as { trip_day_id: string }[]) {
              const tid = tripByDay.get(a.trip_day_id);
              if (tid) counts[tid] = (counts[tid] ?? 0) + 1;
            }
          }
        }
      } catch (e) {
        console.warn('[Travel] stop counts unavailable', e);
      }
    }
    setStopCountByTrip(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadTrips();
  }, [session?.user?.id, loadTrips]);

  function openCreate() {
    const today = localDateStr(new Date());
    if (!startDate) setStartDate(today);
    if (!endDate) {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      setEndDate(localDateStr(d));
    }
    setTripIntent('work');
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
      const day = now.getDay();
      const toSat = day === 0 ? -1 : 6 - day;
      const sat = new Date(now);
      sat.setDate(now.getDate() + toSat);
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);
      setStartDate(localDateStr(sat));
      setEndDate(localDateStr(sun));
      return;
    }
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
        intent: tripIntent,
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

    const { error: daysError } = await supabase
      .from('trip_days')
      .insert(dayRows);

    setSaving(false);
    if (daysError) {
      alert(daysError.message);
      return;
    }

    setName('');
    setStartDate('');
    setEndDate('');
    setTripIntent('work');
    setCreateOpen(false);
    router.push(`/travel/${tripRow.id}`);
  }

  async function deleteTrip(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    if (!confirm('Delete this trip and everything planned in it?')) return;
    await supabase.from('trips').delete().eq('id', id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }

  const surface = useMemo(
    () =>
      buildTravelSurfaceModel({
        trips,
        todayStr,
        stopCountByTrip,
      }),
    [trips, todayStr, stopCountByTrip]
  );

  const searchTerm = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (trip: Trip) => {
      if (!searchTerm) return true;
      return [trip.name, trip.start_date, trip.end_date].some((v) =>
        v.toLowerCase().includes(searchTerm)
      );
    },
    [searchTerm]
  );

  const filterBucket = useCallback(
    (list: TripLike[]) =>
      (list as Trip[]).filter(matchesSearch).filter((trip) =>
        !selectedDate || (trip.start_date <= selectedDate && trip.end_date >= selectedDate)
      ),
    [matchesSearch, selectedDate]
  );

  const sections = useMemo(() => {
    if (listFilter === 'active') {
      return [
        {
          key: 'active',
          title: 'In motion',
          lede: 'Travel regime is on',
          items: filterBucket(surface.active),
        },
      ].filter((s) => s.items.length > 0);
    }
    if (listFilter === 'upcoming') {
      return [
        {
          key: 'upcoming',
          title: 'Ahead',
          lede: null as string | null,
          items: filterBucket(surface.upcoming),
        },
      ].filter((s) => s.items.length > 0);
    }
    if (listFilter === 'past') {
      return [
        {
          key: 'past',
          title: 'Earlier',
          lede: 'Routes and stops stay on file',
          items: filterBucket(surface.past),
        },
      ].filter((s) => s.items.length > 0);
    }
    return [
      {
        key: 'active',
        title: 'In motion',
        lede: surface.active.length ? 'Travel regime is on' : null,
        items: filterBucket(surface.active),
      },
      {
        key: 'upcoming',
        title: 'Ahead',
        lede: null,
        items: filterBucket(surface.upcoming),
      },
      {
        key: 'past',
        title: 'Earlier',
        lede: null,
        items: filterBucket(surface.past),
      },
    ].filter((s) => s.items.length > 0);
  }, [listFilter, surface, filterBucket]);

  const totalVisible = sections.reduce((s, sec) => s + sec.items.length, 0);
  const featured = surface.featured;
  const featuredRow = featured ? surface.rows[featured.id] : null;

  function renderRow(tr: TripLike) {
    const row = surface.rows[tr.id];
    const pressure = row?.pressure ?? 'later';

    return (
      <div key={tr.id} className={'trip-row-maybach surface-object pressure-' + pressure}>
        <TripObjectLink
          trip={tr}
          pressure={pressure}
          dateRange={fmtDateRange(tr.start_date, tr.end_date)}
          stopCount={row?.stopCount ?? null}
          phaseLabel={row?.phaseLabel ?? null}
          relativeLine={row?.relativeLine ?? null}
          dayCount={row?.dayCount ?? null}
        />
        <button type="button" className="trip-row-delete" onClick={(e) => deleteTrip(tr.id, e)} aria-label={'Delete ' + tr.name}>
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (session && (entLoading || !canTravel)) {
    return (
      <div className="app-shell">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell" style={{ paddingTop: 40 }}>
        Sign in to see your trips.
      </div>
    );
  }

  return (
    <div className="app-shell travel-shell">
      {!isDesktop && (
        <div className="app-header travel-mobile-header">
          <div className="app-header-left">
            <div className="travel-mobile-identity surface-mobile-identity">
              <SurfaceHeaderIdentity
                kicker="Place / Motion"
                title="Travel"
                signal={surface.active.length > 0 ? `${surface.active.length} active` : surface.upcoming.length > 0 ? `${surface.upcoming.length} upcoming` : 'Clear'}
                meta={surface.pulseMeta || null}
                attention={surface.pulseAttention}
                clear={surface.active.length + surface.upcoming.length === 0}
              />
            </div>
          </div>
          <div className="app-header-right">
            <GearMenu userId={session?.user.id ?? null} />
          </div>
        </div>
      )}

      {isDesktop ? (
        <DesktopTravelHeader
          pulseTitle={surface.active.length > 0 ? `${surface.active.length} active` : surface.upcoming.length > 0 ? `${surface.upcoming.length} upcoming` : 'Clear'}
          pulseMeta={surface.pulseMeta}
          pulseAttention={surface.pulseAttention}
          depthRead={surface.depthRead}
          consequenceLine={surface.consequenceLine}
          activeCount={surface.active.length}
          upcomingCount={surface.upcoming.length}
          pastCount={surface.past.length}
          allCount={trips.length}
          nextRelative={surface.nextRelative}
          nextTripId={featured?.id ?? null}
          featuredTitle={featured?.name ?? null}
          featuredPhase={featuredRow?.phaseLabel ?? null}
          featuredRelative={featuredRow?.relativeLine ?? null}
          filter={listFilter}
          onFilterChange={setListFilter}
          search={search}
          onSearchChange={setSearch}
          onCreate={openCreate}
        />
      ) : null}

      {!loading && trips.length > 0 ? (
        <SurfaceDateCarousel selectedDate={selectedDate} onChange={setSelectedDate} />
      ) : null}

      {!isDesktop ? (
        <div className="travel-mobile-controls">
          {!selectedDate && featured &&
          featuredRow &&
          (featuredRow.pressure === 'now' || featuredRow.pressure === 'soon') ? (
            <Link
              href={`/travel/${featured.id}`}
              className="travel-featured surface-object surface-object-featured travel-featured-mobile"
            >
              <div className="travel-featured-body">
                <span className="travel-featured-title">{featured.name}</span>
                <span className="travel-featured-time surface-object-time mono">
                  {fmtDateRange(featured.start_date, featured.end_date)}
                  <span aria-hidden="true"> · </span>
                  {featuredRow.phase === 'active' ? 'Now' : 'Next'}
                </span>
              </div>
            </Link>
          ) : null}
          <div className="surface-filters" role="tablist" aria-label="Filters">
            {(
              [
                ['all', 'All', trips.length],
                ['active', 'Active', surface.active.length],
                ['upcoming', 'Ahead', surface.upcoming.length],
                ['past', 'Past', surface.past.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={listFilter === key}
                className={listFilter === key ? 'surface-filter is-active' : 'surface-filter'}
                onClick={() => setListFilter(key)}
              >
                {label}
                <span className="mono">{count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : trips.length === 0 ? (
        <div className="empty-state travel-empty">
          <div className="empty-state-title">No trips yet</div>
          <div className="empty-state-sub">
            Plan movement when the work needs it. Days and stops stay with the trip — Today can
            respect the regime instead of guessing.
          </div>
          <button type="button" className="btn btn-steel" onClick={openCreate}>
            Plan a trip
          </button>
        </div>
      ) : totalVisible === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing in this view</div>
          <div className="empty-state-sub">Try another filter, or clear search.</div>
        </div>
      ) : (
        <div className="travel-workspace">
          {sections.map((sec) => (
            <section key={sec.key} className="trip-section">
              <header className="trip-section-header">
                <h2 className="trip-section-title">{sec.title}</h2>
                {sec.lede ? <p className="trip-section-lede">{sec.lede}</p> : null}
              </header>
              <div className="trip-list-maybach">{sec.items.map(renderRow)}</div>
            </section>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="sheet-backdrop" onClick={closeCreate}>
          <div
            ref={createDialogRef}
            className="capture-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Plan a trip"
          >
            <div className="task-detail-header" style={{ marginBottom: 0 }}>
              <div className="settings-panel-title">Plan a trip</div>
              <button type="button" className="gear-btn" onClick={closeCreate} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="sheet-body">
              <label className="field-label">Name</label>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wellington site week"
                autoFocus
              />

              <label className="field-label" style={{ marginTop: 14 }}>
                Intent
              </label>
              <div className="surface-filters" style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className={tripIntent === 'work' ? 'surface-filter is-active' : 'surface-filter'}
                  onClick={() => setTripIntent('work')}
                >
                  Work
                </button>
                <button
                  type="button"
                  className={
                    tripIntent === 'personal' ? 'surface-filter is-active' : 'surface-filter'
                  }
                  onClick={() => setTripIntent('personal')}
                >
                  Personal
                </button>
              </div>

              <label className="field-label" style={{ marginTop: 14 }}>
                Dates
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button type="button" className="meeting-pill" onClick={() => applyDatePreset('today')}>
                  Today
                </button>
                <button
                  type="button"
                  className="meeting-pill"
                  onClick={() => applyDatePreset('weekend')}
                >
                  Weekend
                </button>
                <button type="button" className="meeting-pill" onClick={() => applyDatePreset('week')}>
                  Week
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="date"
                  className="field-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <input
                  type="date"
                  className="field-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              {error ? (
                <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
              ) : null}

              <button
                type="button"
                className="btn btn-steel"
                style={{ marginTop: 16, width: '100%' }}
                disabled={saving}
                onClick={createTrip}
              >
                {saving ? 'Creating…' : 'Create trip'}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
