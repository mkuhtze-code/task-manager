'use client';

/**
 * Meetings overview — Pro / Maybach surface.
 * Same tone as Today; intelligence is conversation → consequence.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting } from '@/lib/meetingTypes';
import type { Job } from '@/lib/jobTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { localDateStr } from '@/lib/timeFormat';
import SurfaceDateCarousel from '@/components/SurfaceDateCarousel';
import { ExperienceFilterBar } from '@/components/ExperienceFilterBar';
import { buildMeetingsSurfaceModel } from '@/lib/meetings/meetingSurface';
import {
  NewMeetingSheet,
  type NewMeetingPayload,
} from '@/components/MeetingSheets';
import GearMenu from '@/components/GearMenu';
import SurfaceHeaderIdentity from '@/components/SurfaceHeaderIdentity';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { authedFetch } from '@/lib/authedFetch';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import DesktopMeetingsHeader, {
  type MeetingsListFilter,
} from '@/components/DesktopMeetingsHeader';
import { useNow } from '@/hooks/useNow';
import MeetingObjectLink from '@/components/MeetingObjectLink';
import { useSurfaceReturnState } from '@/hooks/useSurfaceReturnState';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';

function fmtDur(mins: number): string {
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function MeetingsHome() {
  const router = useRouter();
  // 15s — live “ends in” stays honest without thrashing the tree
  const now = useNow(15_000);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openActionsByMeeting, setOpenActionsByMeeting] = useState<
    Record<string, number>
  >({});
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] =
    useState<MeetingsListFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useSurfaceReturnState(
    session?.user?.id ? `dokkit.surface-return.${session.user.id}.meetings.v1` : null,
    { listFilter, search, selectedDate },
    (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (saved.listFilter === 'all' || saved.listFilter === 'upcoming' || saved.listFilter === 'past') {
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

  const { isDesktop } = useSurfaceMode();
  const { entitlements, loading: entLoading } = useEntitlements(
    session?.user?.id
  );

  const canMeetings = entitlements.canUseMeetings;

  useEffect(() => {
    if (!canMeetings) return;
    return registerDesktopPrimaryAction('Record', () => setNewMeetingOpen(true));
  }, [canMeetings]);

  useProRedirect(
    !entLoading && Boolean(session),
    canMeetings,
    'meetings'
  );

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (!s) setLoading(false);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session));

    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    const userId = session.user.id;

    const { data: meetingRows, error: meetingErr } = await supabase
      .from('meetings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (meetingErr) {
      console.error(meetingErr);
      setError("Meetings couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    const { data: jobRows } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId);

    const openMap: Record<string, number> = {};
    try {
      const { data: actionRows } = await supabase
        .from('meeting_actions')
        .select('meeting_id, task_id')
        .eq('user_id', userId)
        .is('task_id', null);

      if (actionRows) {
        for (const row of actionRows as {
          meeting_id: string;
          task_id: string | null;
        }[]) {
          if (!row.meeting_id) continue;
          openMap[row.meeting_id] = (openMap[row.meeting_id] ?? 0) + 1;
        }
      }
    } catch (e) {
      console.warn('[Meetings] open actions unavailable', e);
    }

    setMeetings((meetingRows as Meeting[]) || []);
    setJobs((jobRows as Job[]) || []);
    setOpenActionsByMeeting(openMap);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (session) load();
  }, [session?.user?.id, load]);

  async function createMeeting(payload: NewMeetingPayload) {
    if (!canMeetings) return;

    setSaving(true);
    setError(null);

    try {
      const json = await authedFetch('/api/meetings', {
        text: payload.text,
        durationMins: payload.durationMins,
        startTime: payload.startTime,
        jobId: payload.jobId,
        locationText: payload.locationText,
        lat: payload.lat,
        lng: payload.lng,
        notes: payload.notes,
      });

      if (!json.id) {
        console.error('Meeting insert failed', json);
        setError(
          json.error === 'Meetings requires a Dokkit plan'
            ? 'Meetings requires a Dokkit plan'
            : "Couldn't record the meeting"
        );
        return;
      }

      setNewMeetingOpen(false);
      router.push(`/meetings/${json.id}`);
    } catch (e) {
      console.error('Meeting insert failed', e);
      setError("Couldn't record the meeting");
    } finally {
      setSaving(false);
    }
  }

  const jobName = useCallback(
    (id: string | null): string | null =>
      id ? jobs.find((j) => j.id === id)?.name ?? null : null,
    [jobs]
  );

  const surface = useMemo(
    () =>
      buildMeetingsSurfaceModel({
        meetings,
        now,
        openActionsByMeeting,
      }),
    [meetings, now, openActionsByMeeting]
  );

  const searchTerm = search.trim().toLowerCase();

  const matchesSearch = useCallback(
    (meeting: Meeting) => {
      if (!searchTerm) return true;
      const job = jobName(meeting.job_id);
      return [meeting.text, meeting.location_text, meeting.source, job]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(searchTerm)
        );
    },
    [searchTerm, jobName]
  );

  const filterBucket = useCallback(
    (list: Meeting[]) =>
      list.filter(matchesSearch).filter((meeting) =>
        !selectedDate ||
        Boolean(meeting.start_time && localDateStr(new Date(meeting.start_time)) === selectedDate)
      ),
    [matchesSearch, selectedDate]
  );

  const sections = useMemo(() => {
    if (listFilter === 'past') {
      const needing = filterBucket(surface.pastNeedingFollowUp);
      const rest = filterBucket(
        surface.past.filter(
          (m) => !surface.pastNeedingFollowUp.some((x) => x.id === m.id)
        )
      );
      return [
        needing.length
          ? {
              key: 'follow-up',
              title: 'Needs follow-up',
              lede: 'Still open from earlier conversations',
              items: needing,
            }
          : null,
        rest.length
          ? {
              key: 'past',
              title: 'Earlier',
              lede: 'What was said stays available',
              items: rest,
            }
          : null,
      ].filter(Boolean) as {
        key: string;
        title: string;
        lede: string | null;
        items: Meeting[];
      }[];
    }

    if (listFilter === 'upcoming') {
      return [
        {
          key: 'live',
          title: 'Now',
          lede: null as string | null,
          items: filterBucket(surface.live),
        },
        {
          key: 'today',
          title: 'Today',
          lede: surface.todayLoadMins
            ? `${fmtDur(surface.todayLoadMins)} on the clock`
            : null,
          items: filterBucket(surface.today),
        },
        {
          key: 'upcoming',
          title: 'Ahead',
          lede: null,
          items: filterBucket(surface.upcoming),
        },
        {
          key: 'flexible',
          title: 'Unscheduled',
          lede: 'Captured without a fixed time',
          items: filterBucket(surface.flexible),
        },
      ].filter((s) => s.items.length > 0);
    }

    return [
      {
        key: 'live',
        title: 'Happening',
        lede: 'In progress',
        items: filterBucket(surface.live),
      },
      {
        key: 'today',
        title: 'Today',
        lede: surface.todayLoadMins
          ? `${fmtDur(surface.todayLoadMins)} fixed time`
          : null,
        items: filterBucket(surface.today),
      },
      {
        key: 'upcoming',
        title: 'Ahead',
        lede: null,
        items: filterBucket(surface.upcoming),
      },
      {
        key: 'flexible',
        title: 'Unscheduled',
        lede: null,
        items: filterBucket(surface.flexible),
      },
      surface.pastNeedingFollowUp.length
        ? {
            key: 'follow-up',
            title: 'Needs follow-up',
            lede: `${surface.openLoopCount} open`,
            items: filterBucket(surface.pastNeedingFollowUp),
          }
        : null,
      {
        key: 'past',
        title: 'Earlier',
        lede: null,
        items: filterBucket(
          surface.past.filter(
            (m) =>
              !surface.pastNeedingFollowUp.some((x) => x.id === m.id)
          )
        ),
      },
    ].filter(
      (s): s is { key: string; title: string; lede: string | null; items: Meeting[] } =>
        Boolean(s && s.items.length > 0)
    );
  }, [listFilter, surface, filterBucket]);

  const totalVisible = sections.reduce((s, sec) => s + sec.items.length, 0);

  const filterCounts = {
    all: meetings.length,
    upcoming:
      surface.live.length +
      surface.today.length +
      surface.upcoming.length +
      surface.flexible.length,
    past: surface.past.length,
  };

  const featured = surface.live[0] ?? surface.today[0] ?? null;
  const featuredRow = featured ? surface.rows[featured.id] : null;

  function renderRow(m: Meeting) {
    const row = surface.rows[m.id];
    return (
      <MeetingObjectLink
        key={m.id}
        meeting={m}
        jobName={jobName(m.job_id)}
        pressure={row?.pressure ?? 'later'}
        openActionCount={row?.openActionCount ?? 0}
        timeWindow={fmtMeetingWindow(m.start_time, m.duration_mins)}
        relativeLine={row?.relativeLine}
        hasNotes={Boolean(row?.hasNotes)}
        hasSummary={Boolean(row?.hasSummary)}
      />
    );
  }

  if (session && (entLoading || !canMeetings)) {
    return (
      <div className="app-shell">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  return (
    <div className="app-shell meetings-shell">
      {!isDesktop && (
        <div className="app-header meetings-mobile-header">
          <div className="app-header-left">
            <div className="meetings-mobile-identity surface-mobile-identity">
              <SurfaceHeaderIdentity
                kicker="People / Time"
                title="Meetings"
                signal={surface.live.length > 0 ? `${surface.live.length} live` : surface.today.length > 0 ? `${surface.today.length} today` : surface.upcoming.length + surface.flexible.length > 0 ? `${surface.upcoming.length + surface.flexible.length} ahead` : 'Clear'}
                meta={surface.pulseMeta || null}
                attention={surface.pulseAttention}
                clear={surface.live.length + surface.today.length + surface.upcoming.length + surface.flexible.length === 0}
              />
            </div>
          </div>
          <div className="app-header-right">
            {canMeetings && (
              <button type="button" className="btn btn-steel ux-button ux-button--primary" onClick={() => setNewMeetingOpen(true)}>
                Record
              </button>
            )}
            <GearMenu userId={session?.user.id ?? null} />
          </div>
        </div>
      )}

      {isDesktop ? (
        <DesktopMeetingsHeader
          pulseTitle={surface.live.length > 0 ? `${surface.live.length} live` : surface.today.length > 0 ? `${surface.today.length} today` : surface.upcoming.length + surface.flexible.length > 0 ? `${surface.upcoming.length + surface.flexible.length} ahead` : 'Clear'}
          pulseMeta={surface.pulseMeta}
          pulseAttention={surface.pulseAttention}
          depthRead={surface.depthRead}
          consequenceLine={surface.consequenceLine}
          todayCount={surface.live.length + surface.today.length}
          upcomingCount={surface.upcoming.length + surface.flexible.length}
          pastCount={surface.past.length}
          todayLoadMins={surface.todayLoadMins}
          openLoopCount={surface.openLoopCount}
          nextLabel={surface.nextLabel}
          nextRelative={surface.nextRelative}
          nextMeetingId={featured?.id ?? surface.next?.id ?? null}
          featuredTitle={featured?.text ?? null}
          featuredPhase={featuredRow?.phaseLabel ?? null}
          listFilter={listFilter}
          onListFilter={setListFilter}
          search={search}
          onSearchChange={setSearch}
          onNewMeeting={() => setNewMeetingOpen(true)}
          filterCounts={filterCounts}
        />
      ) : null}

      {!loading && meetings.length > 0 ? (
        <SurfaceDateCarousel selectedDate={selectedDate} onChange={setSelectedDate} />
      ) : null}

      {!isDesktop ? (
        <div className="meetings-mobile-controls">
          {!selectedDate && featured && featuredRow && (featuredRow.pressure === 'now' || featuredRow.pressure === 'soon') ? (
            <Link
              href={`/meetings/${featured.id}`}
              className="meetings-featured surface-object surface-object-featured meetings-featured-mobile"
            >
              <div className="meetings-featured-body">
                <span className="meetings-featured-title">{featured.text}</span>
                <span className="meetings-featured-time surface-object-time mono">
                  {fmtMeetingWindow(featured.start_time, featured.duration_mins)}
                  <span aria-hidden="true"> · </span>
                  {featuredRow.phase === 'live' ? 'Now' : 'Next'}
                </span>
              </div>
            </Link>
          ) : null}
          <ExperienceFilterBar
            ariaLabel="Meeting filters"
            value={listFilter}
            onChange={setListFilter}
            options={[
              { key: 'all', label: 'All', count: filterCounts.all },
              { key: 'upcoming', label: 'Ahead', count: filterCounts.upcoming },
              { key: 'past', label: 'Past', count: filterCounts.past },
            ]}
          />
        </div>
      ) : null}

      {error ? (
        <button
          type="button"
          className="recalc-error"
          onClick={() => load()}
        >
          {error}
        </button>
      ) : null}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : meetings.length === 0 ? (
        <div className="empty-state meetings-empty">
          <div className="empty-state-title">No conversations yet</div>
          <div className="empty-state-sub">
            Notes, decisions, and follow-up in one place.
          </div>
        </div>
      ) : totalVisible === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Nothing in this view</div>
          <div className="empty-state-sub">
            Try another filter, or clear search.
          </div>
        </div>
      ) : (
        <div className="meetings-workspace">
          {sections.map((sec) => (
            <section key={sec.key} className="meeting-section">
              <header className="meeting-section-header">
                <h2 className="meeting-section-title">{sec.title}</h2>
                {sec.lede ? (
                  <p className="meeting-section-lede">{sec.lede}</p>
                ) : null}
              </header>
              <div className="meeting-list">{sec.items.map(renderRow)}</div>
            </section>
          ))}
        </div>
      )}

      {newMeetingOpen ? (
        <NewMeetingSheet
          saving={saving}
          jobs={jobs}
          onClose={() => setNewMeetingOpen(false)}
          onCreate={createMeeting}
        />
      ) : null}


    </div>
  );
}
