'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type {
  Meeting,
  MeetingParticipant,
  MeetingObservation,
  MeetingDecision,
  MeetingAction,
  MeetingMedia,
} from '@/lib/meetingTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { MeetingMediaCapture, type CapturedMedia } from '@/components/MeetingSheets';
import MicButton from '@/components/MicButton';
import GearMenu from '@/components/GearMenu';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, TrashIcon } from '@/components/icons';

export default function MeetingDetail({ params }: { params: { meetingId: string } }) {
  const meetingId = params.meetingId;
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [jobName, setJobName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [observations, setObservations] = useState<MeetingObservation[]>([]);
  const [decisions, setDecisions] = useState<MeetingDecision[]>([]);
  const [actions, setActions] = useState<MeetingAction[]>([]);
  const [media, setMedia] = useState<MeetingMedia[]>([]);

  // Add-row inputs.
  const [participantInput, setParticipantInput] = useState('');
  const [decisionInput, setDecisionInput] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [observationText, setObservationText] = useState('');
  const [pendingMedia, setPendingMedia] = useState<CapturedMedia[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const userId = session.user.id;

    const { data: m, error: mErr } = await supabase
      .from('meetings')
      .select('*')
      .eq('user_id', userId)
      .eq('id', meetingId)
      .maybeSingle();
    if (mErr || !m) {
      console.error(mErr);
      setError(mErr ? "Couldn't load the meeting" : 'Meeting not found');
      setLoading(false);
      return;
    }
    setMeeting(m as Meeting);
    setNotes(m.notes || '');

    const run = async (table: string) => {
      const { data } = await supabase
        .from(table)
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });
      return (data as any[]) || [];
    };

    const [people, obs, dec, act, med] = await Promise.all([
      run('meeting_participants'),
      run('meeting_observations'),
      run('meeting_decisions'),
      run('meeting_actions'),
      supabase.from('meeting_media').select('*').eq('meeting_id', meetingId).then(({ data }) => (data as MeetingMedia[]) || []),
    ]);

    setParticipants(people as MeetingParticipant[]);
    setObservations(obs as MeetingObservation[]);
    setDecisions(dec as MeetingDecision[]);
    setActions(act as MeetingAction[]);
    setMedia(med);
    setLoading(false);

    if (m.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('name')
        .eq('id', m.job_id)
        .maybeSingle();
      setJobName(job?.name ?? null);
    }
  }, [session, meetingId]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function saveNotes() {
    if (!meeting) return;
    await supabase
      .from('meetings')
      .update({ notes: notes.trim() || null })
      .eq('id', meeting.id);
    setMeeting((prev) => (prev ? { ...prev, notes: notes.trim() || null } : prev));
  }

  async function addRow(table: string, text: string, textKey = 'text') {
    if (!session || !text.trim()) return;
    const { error: e } = await supabase.from(table).insert({
      user_id: session.user.id,
      meeting_id: meetingId,
      [textKey]: text.trim(),
    });
    if (e) {
      console.error(e);
      setError("Couldn't save that — try again");
      return;
    }
    await load();
  }

  async function addParticipant() {
    if (!participantInput.trim()) return;
    await addRow('meeting_participants', participantInput, 'name');
    setParticipantInput('');
  }

  async function addDecision() {
    if (!decisionInput.trim()) return;
    await addRow('meeting_decisions', decisionInput);
    setDecisionInput('');
  }

  async function addAction() {
    if (!actionInput.trim()) return;
    await addRow('meeting_actions', actionInput);
    setActionInput('');
  }

  // A photo + a voice note + a line of text = ONE observation. The rows
  // are created together; media reference device-local bytes only.
  async function addObservation() {
    const text = observationText.trim();
    if (text.length === 0 && pendingMedia.length === 0) return;
    if (!session) return;
    setSaving(true);
    setError(null);

    const { data: obs, error: obsErr } = await supabase
      .from('meeting_observations')
      .insert({ user_id: session.user.id, meeting_id: meetingId, text })
      .select('id')
      .single();
    if (obsErr || !obs) {
      console.error(obsErr);
      setError("Couldn't save the observation");
      setSaving(false);
      return;
    }

    for (const m of pendingMedia) {
      await supabase.from('meeting_media').insert({
        user_id: session.user.id,
        meeting_id: meetingId,
        observation_id: obs.id,
        media_type: m.mediaType,
        local_uri: m.uri,
        mime_type: m.mime,
        size_bytes: m.size,
      });
    }

    setObservationText('');
    setPendingMedia([]);
    setSaving(false);
    await load();
  }

  async function removeRow(table: string, id: string) {
    await supabase.from(table).delete().eq('id', id).eq('user_id', session.user.id);
    await load();
  }

  async function deleteMeeting() {
    if (!meeting) return;
    if (!window.confirm('Delete this meeting and everything recorded under it?')) return;
    const { error: e } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meeting.id)
      .eq('user_id', session.user.id);
    if (e) {
      console.error(e);
      setError("Couldn't delete the meeting");
      return;
    }
    router.push('/meetings');
  }

  if (!session) {
    return <div className="empty-state">{loading ? 'Loading…' : 'Not signed in'}</div>;
  }

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!meeting) {
    return (
      <div className="app-shell">
        <div className="app-header">
          <div className="app-header-left">
            <Link href="/meetings" className="back-link" aria-label="Back to meetings">
              <BackIcon />
            </Link>
            <h1 className="app-title">Meeting</h1>
          </div>
          <div className="app-header-right">
            <GearMenu context="work" userId={session.user.id} />
          </div>
        </div>
        <div className="empty-state">
          {error || 'Meeting not found.'}
        </div>
        <SurfaceNav active="meetings" />
      </div>
    );
  }

  const mediaFor = (obsId: string) => media.filter((m) => m.observation_id === obsId);

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <Link href="/meetings" className="back-link" aria-label="Back to meetings">
            <BackIcon />
          </Link>
          <h1 className="app-title">{meeting.text}</h1>
        </div>
        <div className="app-header-right">
          <GearMenu context="work" userId={session.user.id} />
        </div>
      </div>

      {error && (
        <button className="recalc-error" onClick={load}>
          {error}
        </button>
      )}

      <div className="meeting-context">
        <div className="meeting-context-line">
          {fmtMeetingWindow(meeting.start_time, meeting.duration_mins)}
        </div>
        {(jobName || meeting.location_text) && (
          <div className="meeting-row-sub">
            {jobName && (
              <Link href={`/jobs/${meeting.job_id}`} className="meeting-chip">
                📁 {jobName}
              </Link>
            )}
            {meeting.location_text && <span className="meeting-chip">📍 {meeting.location_text}</span>}
          </div>
        )}
      </div>

      <section className="detail-section">
        <div className="detail-section-title">People</div>
        {participants.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>No participants yet.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="meeting-list-row">
              <span>{p.name}</span>
              <button className="btn-text" onClick={() => removeRow('meeting_participants', p.id)}>
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        <div className="meeting-add-row">
          <input
            type="text"
            value={participantInput}
            onChange={(e) => setParticipantInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addParticipant(); }}
            placeholder="Who was there?"
          />
          <button className="btn btn-steel" onClick={addParticipant}>Add</button>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Observations</div>
        {observations.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>Evidence captured here stays source-first.</p>
        ) : (
          observations.map((o) => (
            <div key={o.id} className="meeting-list-row" style={{ flexDirection: 'column' }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8 }}>
                <span>{o.text || <em style={{ color: 'var(--ink-faint)' }}>(media only)</em>}</span>
                <button className="btn-text" onClick={() => removeRow('meeting_observations', o.id)}>
                  <TrashIcon />
                </button>
              </div>
              {mediaFor(o.id).length > 0 && (
                <div className="meeting-media-row">
                  {mediaFor(o.id).map((m) =>
                    m.media_type === 'audio' ? (
                      <div key={m.id} className="media-thumb-audio">
                        <audio controls src={m.local_uri} style={{ height: '100%', width: '100%' }} />
                      </div>
                    ) : m.media_type === 'document' ? (
                      <div key={m.id} className="media-thumb-doc">📄</div>
                    ) : (
                      <div key={m.id} className="media-thumb">
                        <img src={m.local_uri} alt="Meeting photo" />
                      </div>
                    ),
                  )}
                </div>
              )}
              <span className="meeting-list-row-sub">Captured {new Date(o.captured_at).toLocaleString()}</span>
            </div>
          ))
        )}
        <div className="meeting-add-row">
          <input
            type="text"
            value={observationText}
            onChange={(e) => setObservationText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addObservation(); }}
            placeholder="A thing you saw, heard or noticed"
          />
          <MicButton
            onResult={(t) =>
              setObservationText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${t}` : t))
            }
          />
        </div>
        <MeetingMediaCapture onCapture={(m) => setPendingMedia((prev) => [...prev, m])} />
        {pendingMedia.length > 0 && (
          <div className="meeting-media-row">
            {pendingMedia.map((m, i) => (
              <div key={i} className={m.mediaType === 'audio' ? 'media-thumb-audio' : 'media-thumb'}>
                {m.mediaType === 'audio' ? (
                  <audio controls src={m.uri} style={{ height: '100%', width: '100%' }} />
                ) : (
                  <img src={m.uri} alt="Pending meeting photo" />
                )}
              </div>
            ))}
            <button className="btn-text" onClick={() => setPendingMedia([])}>Clear</button>
          </div>
        )}
        <div>
          <button className="btn btn-steel" onClick={addObservation} disabled={saving}>
            {saving ? 'Saving…' : 'Save observation'}
          </button>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Decisions</div>
        {decisions.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>Nothing decided yet.</p>
        ) : (
          decisions.map((d) => (
            <div key={d.id} className="meeting-list-row">
              <span>{d.text}</span>
              <button className="btn-text" onClick={() => removeRow('meeting_decisions', d.id)}>
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        <div className="meeting-add-row">
          <input
            type="text"
            value={decisionInput}
            onChange={(e) => setDecisionInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addDecision(); }}
            placeholder="What did you decide?"
          />
          <button className="btn btn-steel" onClick={addDecision}>Add</button>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Actions</div>
        {actions.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>Nothing to do afterwards yet.</p>
        ) : (
          actions.map((a) => (
            <div key={a.id} className="meeting-list-row">
              <span>
                {a.text}
                {a.task_id && <span className="meeting-list-row-sub"> · linked to a task</span>}
              </span>
              <button className="btn-text" onClick={() => removeRow('meeting_actions', a.id)}>
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        <div className="meeting-add-row">
          <input
            type="text"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addAction(); }}
            placeholder="Something to do because of this meeting"
          />
          <button className="btn btn-steel" onClick={addAction}>Add</button>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Notes (raw capture)</div>
        <textarea
          className="meeting-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything jotted during the meeting — plain text, captured as-is"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-steel" onClick={saveNotes}>Save notes</button>
        </div>
      </section>

      <div className="meeting-delete-row">
        <button className="btn-text" onClick={deleteMeeting} style={{ color: 'var(--hazard)' }}>
          Delete meeting
        </button>
      </div>

      <SurfaceNav active="meetings" />
    </div>
  );
}