'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  normalizePersonName,
  personAlreadyAdded,
  buildObservationDraft,
  groupMediaByObservation,
  fmtCapturedAt,
  type CapturedMedia,
} from '@/lib/meetingCapture';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { ObservationCapture } from '@/components/MeetingSheets';
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
  const [notes, setNotes] = useState('');

  // Reveal-style captives: a quiet "+ Add …" link opens a simple input.
  const [addingPerson, setAddingPerson] = useState(false);
  const [capturingObservation, setCapturingObservation] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [decisionInput, setDecisionInput] = useState('');
  const [actionInput, setActionInput] = useState('');

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
    setError(null);
    await load();
  }

  async function addParticipant() {
    if (!session) return;
    const name = normalizePersonName(participantInput);
    if (!name) return;
    // Quiet duplicate handling: the same name again simply adds nothing.
    if (personAlreadyAdded(participants, name)) {
      setParticipantInput('');
      setAddingPerson(false);
      setError(null);
      return;
    }
    const { error: e } = await supabase.from('meeting_participants').insert({
      user_id: session.user.id,
      meeting_id: meetingId,
      name,
    });
    if (e) {
      console.error(e);
      setError("Couldn't add that person — try again");
      return;
    }
    setError(null);
    setParticipantInput('');
    setAddingPerson(false);
    await load();
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

  // An observation is ONE piece of evidence: text, photo, voice, or any
  // combination. None of them are required together; at least one is
  // required at all. Media rows attach back via observation_id and stay
  // device-local (blob URLs in V1) — nothing here is transcribed or
  // interpreted, just stored as it was captured.
  async function addObservation(draft: { text: string; media: CapturedMedia[] }) {
    if (!session) return;
    const prepared = buildObservationDraft(draft.text, draft.media);
    if (!prepared) return;
    setSaving(true);
    setError(null);

    const { data: obs, error: obsErr } = await supabase
      .from('meeting_observations')
      .insert({ user_id: session.user.id, meeting_id: meetingId, text: prepared.text })
      .select('id')
      .single();
    if (obsErr || !obs) {
      console.error(obsErr);
      setError("Couldn't save the observation");
      setSaving(false);
      return;
    }

    let mediaFailed = false;
    for (const m of prepared.media) {
      const { error: mediaErr } = await supabase.from('meeting_media').insert({
        user_id: session.user.id,
        meeting_id: meetingId,
        observation_id: obs.id,
        media_type: m.mediaType,
        local_uri: m.uri,
        mime_type: m.mime,
        size_bytes: m.size,
      });
      if (mediaErr) {
        console.error(mediaErr);
        mediaFailed = true;
      }
    }
    if (mediaFailed) setError("Couldn't save part of the observation");

    setSaving(false);
    setCapturingObservation(false);
    await load();
  }

  async function removeRow(table: string, id: string) {
    await supabase.from(table).delete().eq('id', id).eq('user_id', session.user.id);
    setError(null);
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

  const mediaByObservation = useMemo(() => groupMediaByObservation(media), [media]);

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
          <div className="meeting-context-meta">
            {jobName && (
              <Link href={`/jobs/${meeting.job_id}`} className="meeting-job-link">
                {jobName}
              </Link>
            )}
            {meeting.location_text && <span className="meeting-location">{meeting.location_text}</span>}
          </div>
        )}
      </div>

      <section className="detail-section">
        <div className="detail-section-title">People</div>
        {participants.length === 0 ? (
          <p className="meeting-empty">No participants yet.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="meeting-list-row">
              <span>{p.name}</span>
              <button className="btn-text" onClick={() => removeRow('meeting_participants', p.id)} aria-label={`Remove ${p.name}`}>
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        {!addingPerson ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setAddingPerson(true)}>
            + Add person
          </button>
        ) : (
          <div className="meeting-add-row">
            <input
              type="text"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addParticipant(); } }}
              placeholder="Name"
              aria-label="Participant name"
              autoFocus
            />
            <button className="btn btn-steel" onClick={addParticipant}>Add</button>
            <button type="button" className="btn-text" onClick={() => { setParticipantInput(''); setAddingPerson(false); }}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Observations</div>
        {observations.length === 0 ? (
          <p className="meeting-empty">No evidence captured yet.</p>
        ) : (
          observations.map((o) => {
            const obsMedia = mediaByObservation.get(o.id) ?? [];
            return (
              <div key={o.id} className="observation-item">
                {o.text && <div className="observation-text">{o.text}</div>}
                {obsMedia.length > 0 && (
                  <div className="meeting-media-row">
                    {obsMedia.map((m) =>
                      m.media_type === 'audio' ? (
                        <audio key={m.id} controls src={m.local_uri} className="media-audio" />
                      ) : (
                        <div key={m.id} className="media-thumb">
                          {m.media_type === 'document' ? (
                            <span className="media-doc-label">Document</span>
                          ) : (
                            <img src={m.local_uri} alt="Meeting photo" />
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
                <div className="observation-meta">
                  <span className="observation-captured">Captured {fmtCapturedAt(o.captured_at)}</span>
                  <button className="btn-text" onClick={() => removeRow('meeting_observations', o.id)} aria-label="Remove observation">
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
        {!capturingObservation ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setCapturingObservation(true)}>
            + Add observation
          </button>
        ) : (
          <ObservationCapture
            saving={saving}
            onSave={addObservation}
            onCancel={() => setCapturingObservation(false)}
          />
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Decisions</div>
        {decisions.length === 0 ? (
          <p className="meeting-empty">Nothing decided yet.</p>
        ) : (
          decisions.map((d) => (
            <div key={d.id} className="meeting-list-row">
              <span>{d.text}</span>
              <button className="btn-text" onClick={() => removeRow('meeting_decisions', d.id)} aria-label="Remove decision">
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
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDecision(); } }}
            placeholder="What did you decide?"
            aria-label="Decision text"
          />
          <button className="btn btn-steel" onClick={addDecision}>Add</button>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-title">Actions</div>
        {actions.length === 0 ? (
          <p className="meeting-empty">Nothing to do afterwards yet.</p>
        ) : (
          actions.map((a) => (
            <div key={a.id} className="meeting-list-row">
              <span>
                {a.text}
                {a.task_id && <span className="meeting-list-row-sub"> · linked to a task</span>}
              </span>
              <button className="btn-text" onClick={() => removeRow('meeting_actions', a.id)} aria-label="Remove action">
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
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAction(); } }}
            placeholder="Something to do because of this meeting"
            aria-label="Action text"
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