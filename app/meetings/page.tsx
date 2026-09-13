'use client';

import { useEffect, useState } from 'react';
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

export default function MeetingsHome() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
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

    setMeetings(meetingRows as Meeting[]);
    setJobs((jobRows as Job[]) || []);
    setLoading(false);
  }

  async function createMeeting(payload: NewMeetingPayload) {
    setSaving(true);
    setError(null);
    const { data, error: insertErr } = await supabase
      .from('meetings')
      .insert({
        user_id: session.user.id,
        text: payload.text,
        duration_mins: payload.durationMins,
        start_time: payload.startTime,
        source: 'manual',
        job_id: payload.jobId,
        location_text: payload.locationText,
        lat: payload.lat,
        lng: payload.lng,
        notes: payload.notes,
      })
      .select('id')
      .single();
    setSaving(false);
    if (insertErr) {
      console.error('Meeting insert failed', {
        userId: session.user.id,
        text: payload.text,
        startTime: payload.startTime,
        durationMins: payload.durationMins,
        jobId: payload.jobId,
        hasLocation: Boolean(payload.locationText),
        error: insertErr,
      });
      setError("Couldn't record the meeting");
      return;
    }
    setNewMeetingOpen(false);
    router.push(`/meetings/${data.id}`);
  }

  const jobName = (id: string | null): string | null =>
    id ? jobs.find((j) => j.id === id)?.name ?? null : null;

  const { upcoming, past } = sortMeetingsForOverview(meetings);
  const hasMeetings = upcoming.length > 0 || past.length > 0;

  function MeetingSection({ title, items }: { title: string; items: Meeting[] }) {
    if (items.length === 0) return null;
    return (
      <section className="meeting-section">
        <div className="meeting-section-title">{title}</div>
        <div className="meeting-list">
          {items.map((m) => {
            const job = jobName(m.job_id);
            return (
              <Link key={m.id} href={`/meetings/${m.id}`} className="meeting-row">
                <div className="meeting-row-top">
                  <span className="meeting-row-name">{m.text}</span>
                  {m.source === 'outlook' && <span className="meeting-source-tag">outlook</span>}
                </div>
                <div className="meeting-row-sub">
                  <span className="meeting-window">{fmtMeetingWindow(m.start_time, m.duration_mins)}</span>
                  {job && <span className="meeting-meta">{job}</span>}
                  {m.location_text && job === null && <span className="meeting-meta">{m.location_text}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <Link href="/" className="back-link" aria-label="Back to today">
            <BackIcon />
          </Link>
          <h1 className="app-title">Meetings</h1>
        </div>
        <div className="app-header-right">
          <GearMenu context="work" userId={session?.user.id ?? null} />
        </div>
      </div>

      {error && (
        <button className="recalc-error" onClick={load} disabled={loading}>
          {error}
        </button>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : !hasMeetings ? (
        <div className="empty-state">
          <div className="empty-state-title">No meetings recorded.</div>
          <div className="empty-state-sub">
            A meeting is a block of time where people came together around a job — capture the moment now, structure it later.
          </div>
          <button className="btn btn-steel" onClick={() => setNewMeetingOpen(true)}>Record a meeting</button>
        </div>
      ) : (
        <>
          <MeetingSection title="Upcoming" items={upcoming} />
          <MeetingSection title="Past" items={past} />
        </>
      )}

      {newMeetingOpen && (
        <NewMeetingSheet
          saving={saving}
          jobs={jobs}
          onClose={() => setNewMeetingOpen(false)}
          onCreate={createMeeting}
        />
      )}

      <SurfaceNav
        active="meetings"
        onAdd={!newMeetingOpen && hasMeetings ? () => setNewMeetingOpen(true) : undefined}
        addLabel="Record a meeting"
      />
    </div>
  );
}