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
  type CapturedMedia,
} from '@/lib/meetingCapture';
import { persistCapturedMedia, deleteMediaBlob } from '@/lib/mediaStore';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { ObservationCapture } from '@/components/MeetingSheets';
import MeetingObservationItem from '@/components/MeetingObservationItem';
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

  // Section capture states: a quiet "+ …" pill in the section header opens
  // its simple input row. Everything here is Meetings-scoped.
  const [addingPerson, setAddingPerson] = useState(false);
  const [capturingObservation, setCapturingObservation] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
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

    // Media loads in capture order: new rows carry a client-stamped
    // captured_at, so the evidence sequence the user made is reproduced.
    const [people, obs, dec, act, med] = await Promise.all([
      run('meeting_participants'),
      run('meeting_observations'),
      run('meeting_decisions'),
      run('meeting_actions'),
      supabase
        .from('meeting_media')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('captured_at', { ascending: true })
        .then(({ data }) => (data as MeetingMedia[]) || []),
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
    setAddingDecision(false);
  }

  async function addAction() {
    if (!actionInput.trim()) return;
    await addRow('meeting_actions', actionInput);
    setActionInput('');
    setAddingAction(false);
  }

  // One observation is saved as ONE row plus its media: text (possibly
  // empty, the column is NOT NULL) and each piece of evidence in capture
  // order. Bytes go to the device's IndexedDB first; local_uri stores the
  // stable idb:// reference. Nothing is uploaded or transcribed.
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

    const ok = await insertMediaRows(obs.id, prepared.media);
    if (!ok) setError("Couldn't save part of the observation");

    setSaving(false);
    setCapturingObservation(false);
    await load();
  }

  // Park captured bytes in IndexedDB and attach them to an observation (or
  // to the meeting). Inserted sequentially in capture order, each stamped
  // with its captured_at.
  async function insertMediaRows(observationId: string | null, list: CapturedMedia[]): Promise<boolean> {
    if (!session) return false;
    let ok = true;
    for (const m of list) {
      const ref = await persistCapturedMedia(m).catch(() => null);
      if (!ref) {
        console.error('Failed to persist local media');
        ok = false;
        continue;
      }
      const { error } = await supabase.from('meeting_media').insert({
        user_id: session.user.id,
        meeting_id: meetingId,
        observation_id: observationId,
        media_type: m.mediaType,
        local_uri: ref,
        mime_type: m.mime,
        size_bytes: m.size,
        captured_at: m.capturedAt,
      });
      if (error) {
        console.error(error);
        ok = false;
        void deleteMediaBlob(ref);
      }
    }
    return ok;
  }

  // Add one piece of evidence straight to a saved observation from its
  // "+ Photo"/"+ Voice" control — no navigation, no separate attach step.
  async function addMediaToObservation(observationId: string, captured: CapturedMedia): Promise<boolean> {
    const ok = await insertMediaRows(observationId, [captured]);
    setError(ok ? null : "Couldn't save the media");
    await load();
    return ok;
  }

  // Apply an in-place edit to ONE observation: the text update, any staged
  // media removals (bytes freed in IndexedDB), and any newly captured media
  // appended in capture order. Returns false on failure so the item keeps
  // its edit open rather than silently dropping the user's changes.
  async function saveObservationEdit(
    observationId: string,
    text: string,
    removeMediaIds: string[],
    newMedia: CapturedMedia[]
  ): Promise<boolean> {
    if (!session) return false;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase
      .from('meeting_observations')
      .update({ text })
      .eq('id', observationId)
      .eq('user_id', session.user.id);
    if (e) {
      console.error(e);
      setError("Couldn't save the observation");
      setSaving(false);
      return false;
    }
    await removeMediaByIds(removeMediaIds);
    const ok = await insertMediaRows(observationId, newMedia);
    if (!ok) setError("Couldn't save some of the new media");
    setSaving(false);
    await load();
    return true;
  }

  async function removeMediaByIds(ids: string[]) {
    if (ids.length === 0) return;
    for (const id of ids) {
      const row = media.find((m) => m.id === id);
      if (row?.local_uri) void deleteMediaBlob(row.local_uri);
    }
    const { error } = await supabase
      .from('meeting_media')
      .delete()
      .in('id', ids)
      .eq('user_id', session.user.id);
    if (error) {
      console.error(error);
      setError("Couldn't remove some media");
    }
  }

  async function removeRow(table: string, id: string) {
    // Free the local bytes behind any media an observation carried when the
    // row that referenced them is deleted.
    if (table === 'meeting_observations') {
      for (const m of media) {
        if (m.observation_id === id && m.local_uri) void deleteMediaBlob(m.local_uri);
      }
    }
    await supabase.from(table).delete().eq('id', id).eq('user_id', session.user.id);
    setError(null);
    await load();
  }

  async function deleteMeeting() {
    if (!meeting) return;
    if (!window.confirm('Delete this meeting and everything recorded under it?')) return;
    for (const m of media) {
      if (m.local_uri) void deleteMediaBlob(m.local_uri);
    }
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
        <div className="detail-section-title-row">
          <div className="detail-section-title">People</div>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setAddingPerson(true)}
            disabled={addingPerson || saving}
          >
            + Person
          </button>
        </div>
        {participants.length === 0 ? (
          <p className="meeting-empty">No participants yet.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="meeting-list-row">
              <span>{p.name}</span>
              <button
                className="meeting-pill meeting-pill--icon"
                onClick={() => removeRow('meeting_participants', p.id)}
                aria-label={`Remove ${p.name}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        {addingPerson && (
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
            <button className="meeting-pill meeting-pill--primary" onClick={addParticipant}>Add</button>
            <button
              type="button"
              className="meeting-pill"
              onClick={() => { setParticipantInput(''); setAddingPerson(false); }}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-title-row">
          <div className="detail-section-title">Observations</div>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setCapturingObservation(true)}
            disabled={capturingObservation || saving}
          >
            + Observation
          </button>
        </div>
        {observations.length === 0 && !capturingObservation && (
          <p className="meeting-empty">No evidence captured yet.</p>
        )}
        {observations.map((o) => (
          <MeetingObservationItem
            key={o.id}
            observation={o}
            media={mediaByObservation.get(o.id) ?? []}
            saving={saving}
            onDelete={() => removeRow('meeting_observations', o.id)}
            onAddMedia={addMediaToObservation}
            onSaveEdit={saveObservationEdit}
          />
        ))}
        {capturingObservation && (
          <ObservationCapture
            saving={saving}
            onSave={addObservation}
            onCancel={() => setCapturingObservation(false)}
          />
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-title-row">
          <div className="detail-section-title">Decisions</div>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setAddingDecision(true)}
            disabled={addingDecision || saving}
          >
            + Decision
          </button>
        </div>
        {decisions.length === 0 ? (
          <p className="meeting-empty">Nothing decided yet.</p>
        ) : (
          decisions.map((d) => (
            <div key={d.id} className="meeting-list-row">
              <span>{d.text}</span>
              <button className="meeting-pill meeting-pill--icon" onClick={() => removeRow('meeting_decisions', d.id)} aria-label="Remove decision">
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        {addingDecision && (
          <div className="meeting-add-row">
            <input
              type="text"
              value={decisionInput}
              onChange={(e) => setDecisionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDecision(); } }}
              placeholder="What did you decide?"
              aria-label="Decision text"
              autoFocus
            />
            <button className="meeting-pill meeting-pill--primary" onClick={addDecision}>Add</button>
            <button
              type="button"
              className="meeting-pill"
              onClick={() => { setDecisionInput(''); setAddingDecision(false); }}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-title-row">
          <div className="detail-section-title">Actions</div>
          <button
            type="button"
            className="meeting-pill"
            onClick={() => setAddingAction(true)}
            disabled={addingAction || saving}
          >
            + Action
          </button>
        </div>
        {actions.length === 0 ? (
          <p className="meeting-empty">Nothing to do afterwards yet.</p>
        ) : (
          actions.map((a) => (
            <div key={a.id} className="meeting-list-row">
              <span>
                {a.text}
                {a.task_id && <span className="meeting-list-row-sub"> · linked to a task</span>}
              </span>
              <button className="meeting-pill meeting-pill--icon" onClick={() => removeRow('meeting_actions', a.id)} aria-label="Remove action">
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        {addingAction && (
          <div className="meeting-add-row">
            <input
              type="text"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAction(); } }}
              placeholder="Something to do because of this meeting"
              aria-label="Action text"
              autoFocus
            />
            <button className="meeting-pill meeting-pill--primary" onClick={addAction}>Add</button>
            <button
              type="button"
              className="meeting-pill"
              onClick={() => { setActionInput(''); setAddingAction(false); }}
            >
              Cancel
            </button>
          </div>
        )}
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
          <button className="meeting-pill meeting-pill--primary" onClick={saveNotes}>Save notes</button>
        </div>
      </section>

      <div className="meeting-delete-row">
        <button type="button" className="meeting-pill meeting-pill--danger" onClick={deleteMeeting}>
          Delete meeting
        </button>
      </div>

      <SurfaceNav active="meetings" />
    </div>
  );
}