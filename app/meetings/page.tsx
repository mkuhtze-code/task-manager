'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting } from '@/lib/meetingTypes';
import type { Job } from '@/lib/jobTypes';
import { sortMeetingsForOverview, fmtMeetingWindow } from '@/lib/meetingUtils';
import { NewMeetingSheet, type NewMeetingPayload } from '@/components/MeetingSheets';
import GearMenu from '@/components/GearMenu';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon } from '@/components/icons';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { authedFetch } from '@/lib/authedFetch';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import DesktopMeetingsHeader, {
  type MeetingsListFilter,
} from '@/components/DesktopMeetingsHeader';

export default function MeetingsHome() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] =
    useState<MeetingsListFilter>('all');
  const [search, setSearch] = useState('');

  const { isDesktop } = useSurfaceMode();
  const { entitlements, loading: entLoading } =
    useEntitlements(session?.user?.id);

  const canMeetings = entitlements.canUseMeetings;

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

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function load() {
    if (!session) return;

    setLoading(true);
    setError(null);

    const userId = session.user.id;

    const { data: meetingRows, error: meetingErr } =
      await supabase
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

    setMeetings((meetingRows as Meeting[]) || []);
    setJobs((jobRows as Job[]) || []);
    setLoading(false);
  }

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

  const jobName = (id: string | null): string | null =>
    id
      ? jobs.find((j) => j.id === id)?.name ?? null
      : null;

  const { upcoming, past } =
    sortMeetingsForOverview(meetings);

  const searchTerm = search.trim().toLowerCase();

  const matchesSearch = (meeting: Meeting) => {
    if (!searchTerm) return true;

    const job = jobName(meeting.job_id);

    return [
      meeting.text,
      meeting.location_text,
      meeting.source,
      job,
    ]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().includes(searchTerm)
      );
  };

  const filteredUpcoming = useMemo(
    () => upcoming.filter(matchesSearch),
    [upcoming, searchTerm, jobs]
  );

  const filteredPast = useMemo(
    () => past.filter(matchesSearch),
    [past, searchTerm, jobs]
  );

  const visibleUpcoming =
    listFilter === 'past' ? [] : filteredUpcoming;

  const visiblePast =
    listFilter === 'upcoming' ? [] : filteredPast;

  const hasMeetings =
    upcoming.length > 0 || past.length > 0;

  function MeetingSection({
    title,
    items,
  }: {
    title: string;
    items: Meeting[];
  }) {
    if (items.length === 0) return null;

    return (
      <section className="meeting-section">
        <div className="meeting-section-title">{title}</div>

        <div className="meeting-list">
          {items.map((m) => {
            const job = jobName(m.job_id);

            return (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="meeting-row"
              >
                <div className="meeting-row-top">
                  <span className="meeting-row-name">
                    {m.text}
                  </span>

                  {m.source === 'outlook' && (
                    <span className="meeting-source-tag">
                      outlook
                    </span>
                  )}
                </div>

                <div className="meeting-row-sub">
                  <span className="meeting-window">
                    {fmtMeetingWindow(
                      m.start_time,
                      m.duration_mins
                    )}
                  </span>

                  {job && (
                    <span className="meeting-meta">
                      {job}
                    </span>
                  )}

                  {m.location_text && job === null && (
                    <span className="meeting-meta">
                      {m.location_text}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  if (session && (entLoading || !canMeetings)) {
    return (
      <div className="app-shell">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const meetingsToday = upcoming.filter((m) => {
    if (!m.start_time) return false;
    return String(m.start_time).slice(0, 10) === todayKey;
  });
  const nextMeeting = upcoming[0] ?? null;
  let nextLabel: string | null = null;
  if (nextMeeting?.start_time) {
    const d = new Date(nextMeeting.start_time);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      nextLabel = `${hh}:${mm} ${(nextMeeting as any).title || (nextMeeting as any).text || 'Meeting'}`;
    }
  }

  return (
    <div className="app-shell">
      {!isDesktop && (
        <div className="app-header">
          <div className="app-header-left">
            <Link
              href="/"
              className="back-link"
              aria-label="Back to today"
            >
              <BackIcon />
            </Link>

            <h1 className="app-title">Meetings</h1>
          </div>

          <div className="app-header-right">
            <GearMenu
              context="work"
              userId={session?.user.id ?? null}
            />
          </div>
        </div>
      )}

      {isDesktop && (
        <DesktopMeetingsHeader
          upcomingCount={upcoming.length}
          pastCount={past.length}
          allCount={meetings.length}
          todayCount={meetingsToday.length}
          nextLabel={nextLabel}
          filter={listFilter}
          onFilterChange={setListFilter}
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setNewMeetingOpen(true)}
        />
      )}

      {error && (
        <button
          className="recalc-error"
          onClick={load}
          disabled={loading}
        >
          {error}
        </button>
      )}

      {loading || entLoading ? (
        <div className="empty-state">Loading…</div>
      ) : !canMeetings ? (
        <div className="empty-state">Loading…</div>
      ) : !hasMeetings ? (
        <div className="empty-state">
          <div className="empty-state-title">
            No meetings recorded.
          </div>

          <div className="empty-state-sub">
            Capture who met, when, and around which job — while
            it is still fresh. Structure can wait.
          </div>

          <button
            className="btn btn-steel"
            onClick={() => setNewMeetingOpen(true)}
          >
            Record a meeting
          </button>
        </div>
      ) : (
        <>
          <MeetingSection
            title="Upcoming"
            items={visibleUpcoming}
          />

          <MeetingSection
            title="Past"
            items={visiblePast}
          />

          {searchTerm &&
            visibleUpcoming.length === 0 &&
            visiblePast.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-title">
                  Nothing matches that search.
                </div>
              </div>
            )}
        </>
      )}

      {canMeetings && newMeetingOpen && (
        <NewMeetingSheet
          saving={saving}
          jobs={jobs}
          onClose={() => setNewMeetingOpen(false)}
          onCreate={createMeeting}
        />
      )}

      <SurfaceNav
        active="meetings"
        onAdd={
          canMeetings &&
          !newMeetingOpen &&
          hasMeetings
            ? () => setNewMeetingOpen(true)
            : undefined
        }
        addLabel="Record a meeting"
      />
    </div>
  );
}
