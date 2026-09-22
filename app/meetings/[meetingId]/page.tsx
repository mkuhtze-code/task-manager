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
import { saveMediaBlob, deleteMediaBlob, isMediaRef } from '@/lib/mediaStore';
import { syncMeetingMediaToCloud, deleteCloudMedia } from '@/lib/mediaCloud';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import { useObservationDrafting } from '@/hooks/useObservationDrafting';
import MeetingObservations from '@/components/MeetingObservations';
import MeetingExport from '@/components/MeetingExport';
import GearMenu from '@/components/GearMenu';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, TrashIcon } from '@/components/icons';
import { buildStorageQuota, wouldExceedQuota } from '@/lib/storageQuota';
import { MeetingConnections } from '@/components/MeetingConnections';
import type { Job } from '@/lib/jobTypes';

export default function MeetingDetail({ params }: { params: { meetingId: string } }) {
  const meetingId = params.meetingId;
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [jobName, setJobName] = useState<string | null>(null);
  const [linkedJob, setLinkedJob] = useState<Job | null>(null);
  const [jobTasks, setJobTasks] = useState<{ id: string; text: string; status: string }[]>([]);
  const [siblingMeetings, setSiblingMeetings] = useState<Meeting[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [linkingJob, setLinkingJob] = useState(false);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [observations, setObservations] = useState<MeetingObservation[]>([]);
  const [decisions, setDecisions] = useState<MeetingDecision[]>([]);
  const [actions, setActions] = useState<MeetingAction[]>([]);
  const [media, setMedia] = useState<MeetingMedia[]>([]);
  const [notes, setNotes] = useState('');

  // Section capture states: a quiet "+ …" pill in the section header opens
  // its simple input row. Everything here is Meetings-scoped.
  const [addingPerson, setAddingPerson] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [decisionInput, setDecisionInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  // The active observation draft and every media capture path live HERE,
  // on the page component, not in the capture sheet: the page survives its
  // own `loading` gate, and sessionStorage rides out even a full reload
  // (the OS camera/file picker can recreate the page on an Android
  // WebView). A draft only closes on an explicit Cancel or a successful
  // Save — a picker returning resumes the same draft.
  const cap = useMeetingMediaCapture();
  const draft = useObservationDrafting(meetingId);
  const capturingObservation = draft.state.phase === 'open';

  function startObservation() {
    draft.begin();
    setError(null);
  }

  function cancelObservation() {
    // The ONLY path that discards the draft: free the staged bytes that
    // were parked in IndexedDB at capture time, then drop the draft.
    for (const m of draft.state.media) {
      if (isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    }
    if (cap.recording) cap.stopRecording();
    draft.discard();
    setError(null);
  }

  function addObservationPhoto() {
    cap.pickPhoto((m) => draft.addMedia(m));
  }

  async function toggleObservationVoice() {
    if (cap.recording) {
      cap.stopRecording();
      return;
    }
    const m = await cap.captureVoice();
    if (m) draft.addMedia(m);
  }

  function removeDraftMedia(index: number) {
    const m = draft.state.media[index];
    if (m && isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    draft.removeMedia(index);
  }

  // Save closes the draft ONLY when the observation (and its rows) commit.
  async function saveObservation(draftPayload: { text: string; media: CapturedMedia[] }) {
    const ok = await addObservation(draftPayload);
    if (ok) draft.complete();
    return ok;
  }

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

    // Jobs list always loaded so an unlinked meeting can be filed under one.
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const jobsList = (jobRows as Job[]) || [];
    setAllJobs(jobsList);

    if (m.job_id) {
      const job = jobsList.find((j) => j.id === m.job_id) ?? null;
      setLinkedJob(job);
      setJobName(job?.name ?? null);

      const [{ data: taskRows }, { data: sibRows }] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, text, status')
          .eq('job_id', m.job_id)
          .neq('status', 'done')
          .order('order_index', { ascending: true })
          .limit(20),
        supabase
          .from('meetings')
          .select('*')
          .eq('job_id', m.job_id)
          .neq('id', meetingId)
          .order('start_time', { ascending: false })
          .limit(10),
      ]);
      setJobTasks((taskRows as { id: string; text: string; status: string }[]) || []);
      setSiblingMeetings((sibRows as Meeting[]) || []);
    } else {
      setLinkedJob(null);
      setJobName(null);
      setJobTasks([]);
      setSiblingMeetings([]);
    }
  }, [session, meetingId]);


  async function linkJob(jobId: string | null) {
    if (!meeting || !session) return;
    setLinkingJob(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('meetings')
      .update({ job_id: jobId })
      .eq('id', meeting.id);
    setLinkingJob(false);
    if (updErr) {
      console.error(updErr);
      setError("Couldn't update job link");
      return;
    }
    setMeeting({ ...meeting, job_id: jobId });
    await load();
  }


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
  // order. Bytes were already parked in IndexedDB at capture time, so
  // local_uri is always the stable idb:// reference; a metadata row is
  // created only for bytes that were successfully stored. Nothing is
  // uploaded or transcribed. Returns false only when nothing was saved, so
  // the capture surface stays open; a partial media failure still saves the
  // observation and reports the missing rows.
  async function addObservation(draft: { text: string; media: CapturedMedia[] }): Promise<boolean> {
    if (!session) return false;
    const prepared = buildObservationDraft(draft.text, draft.media);
    if (!prepared) return false;
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
      return false;
    }

    const ok = await insertMediaRows(obs.id, prepared.media);
    if (!ok) setError("Couldn't save part of the observation");

    setSaving(false);
    await load();
    return true;
  }

  // Attach captured evidence to an observation (or to the meeting).
  // Inserted sequentially in capture order, each stamped with its
  // captured_at. A Supabase failure leaves the local bytes in place (never
  // silently discarded) and simply reports the missing row.
  async function insertMediaRows(observationId: string | null, list: CapturedMedia[]): Promise<boolean> {
    if (!session) return false;
    const addBytes = list.reduce((sum, m) => sum + (m.size || 0), 0);
    if (addBytes > 0) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('storage_used_bytes, storage_limit_bytes')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const quota = buildStorageQuota(
        Number(settings?.storage_used_bytes ?? 0),
        Number(settings?.storage_limit_bytes ?? 0)
      );
      if (wouldExceedQuota(quota, addBytes)) {
        setError(
          'Storage is full. Free space in Account by deleting media, or export your data first.'
        );
        return false;
      }
    }
    let ok = true;
    for (const m of list) {
      let ref = m.uri;
      if (!isMediaRef(ref)) {
        // Defensive only: nothing new captures a blob URL anymore, but
        // local_uri must never store one — migrate any stray bytes to
        // IndexedDB before inserting the row.
        const blob = m.blob ?? (ref.startsWith('blob:') ? await fetch(ref).then((r) => r.blob()) : null);
        if (!blob) {
          console.error('Media bytes unavailable to persist');
          ok = false;
          continue;
        }
        try {
          ref = await saveMediaBlob(blob, { mime: m.mime, size: m.size });
        } catch {
          console.error('Failed to persist local media');
          ok = false;
          continue;
        }
      }
      const { data: mediaRow, error } = await supabase
        .from('meeting_media')
        .insert({
          user_id: session.user.id,
          meeting_id: meetingId,
          observation_id: observationId,
          media_type: m.mediaType,
          local_uri: ref,
          mime_type: m.mime,
          size_bytes: m.size,
          captured_at: m.capturedAt,
          sync_status: 'local_only',
        })
        .select('id')
        .single();
      if (error || !mediaRow) {
        console.error(error);
        ok = false;
      } else {
        // Share with other devices (desktop ↔ mobile). Best-effort; local row stays.
        void syncMeetingMediaToCloud({
          userId: session.user.id,
          meetingId,
          mediaId: mediaRow.id,
          localUri: ref,
          mimeType: m.mime,
        });
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
      if (row?.storage_path) void deleteCloudMedia(row.storage_path);
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
        if (m.observation_id === id && m.storage_path) void deleteCloudMedia(m.storage_path);
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
      if (m.storage_path) void deleteCloudMedia(m.storage_path);
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
        {meeting.location_text && (
          <div className="meeting-context-meta">
            <span className="meeting-location">{meeting.location_text}</span>
          </div>
        )}
      </div>

      <MeetingConnections
        meeting={meeting}
        job={linkedJob}
        jobTasks={jobTasks}
        siblingMeetings={siblingMeetings}
        allJobs={allJobs}
        onLinkJob={linkJob}
        linking={linkingJob}
      />

      <MeetingExport
        userId={session.user.id}
        meetingId={meetingId}
        meeting={meeting}
        jobName={jobName}
        participants={participants}
        observations={observations}
        decisions={decisions}
        actions={actions}
        media={media}
      />

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

      <MeetingObservations
        observations={observations}
        mediaByObservation={mediaByObservation}
        saving={saving}
        onSaveObservation={saveObservation}
        onDelete={(id) => removeRow('meeting_observations', id)}
        onAddMedia={addMediaToObservation}
        onSaveEdit={saveObservationEdit}
        capturing={capturingObservation}
        onStartObservation={startObservation}
        draftText={draft.state.text}
        draftMedia={draft.state.media}
        recording={cap.recording}
        captureError={cap.captureError}
        onTextChange={draft.setText}
        onAddPhoto={addObservationPhoto}
        onToggleVoice={toggleObservationVoice}
        onRemoveDraftMedia={removeDraftMedia}
        onCancelObservation={cancelObservation}
        photoInputRef={cap.photoRef}
        onPhotoInputChange={cap.onPhotoInputChange}
      />

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
