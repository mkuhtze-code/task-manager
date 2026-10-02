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
import { formatObservationText, type CaptureSpeaker } from '@/lib/communication/speaker';
import { saveMediaBlob, deleteMediaBlob, isMediaRef } from '@/lib/mediaStore';
import { syncMeetingMediaToCloud, deleteCloudMedia } from '@/lib/mediaCloud';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import { useObservationDrafting } from '@/hooks/useObservationDrafting';
import MeetingObservations from '@/components/MeetingObservations';
import MeetingCaptureDock from '@/components/MeetingCaptureDock';
import MeetingExport from '@/components/MeetingExport';
import GearMenu from '@/components/GearMenu';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, TrashIcon } from '@/components/icons';
import { checkStorageQuota, STORAGE_FULL_MESSAGE, isQuotaErrorMessage } from '@/lib/assertStorageQuota';
import { MeetingConnections } from '@/components/MeetingConnections';
import PillReveal from '@/components/PillReveal';
import MeetingTripPill from '@/components/MeetingTripPill';
import JobFilesPanel from '@/components/JobFilesPanel';
import type { Job } from '@/lib/jobTypes';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { fetchDurationHistory } from '@/lib/thinking/loadDurationHistory';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import MeetingsPlanGate from '@/components/MeetingsPlanGate';

export default function MeetingDetail({ params }: { params: { meetingId: string } }) {
  const meetingId = params.meetingId;
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const { entitlements, loading: entLoading } = useEntitlements(session?.user?.id);
  const canMeetings = entitlements.canUseMeetings;
  useProRedirect(!entLoading && Boolean(session), canMeetings, 'meetings');
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
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

  const [addingPerson, setAddingPerson] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [decisionInput, setDecisionInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  const cap = useMeetingMediaCapture();
  const draft = useObservationDrafting(meetingId);
  const capturingObservation = draft.state.phase === 'open';

  function startObservation() {
    draft.begin();
    setError(null);
  }

  function cancelObservation() {
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

  async function saveObservation(draftPayload: {
    text: string;
    media: CapturedMedia[];
    speaker?: CaptureSpeaker;
  }) {
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

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    fetchDurationHistory(supabase, session.user.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!meeting || !session?.user?.id) return;
    const start = meeting.start_time ? new Date(meeting.start_time).getTime() : NaN;
    const dur = typeof meeting.duration_mins === 'number' ? meeting.duration_mins : 0;
    if (!Number.isFinite(start) || dur < 1) return;
    if (Date.now() < start + dur * 60_000) return;
    const key = `dokkit-meeting-outcome:${meeting.id}`;
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(key) === '1') return;
      window.localStorage.setItem(key, '1');
    } catch {
      return;
    }
    const title = (meeting.text || 'Meeting').trim() || 'Meeting';
    closeCompletionLoop({
      userId: session.user.id,
      taskText: title,
      estimateMins: dur,
      measuredMins: dur,
      history,
      clusters,
      hints: {
        estimateMins: dur,
        loggedMins: dur,
        jobId: meeting.job_id ?? null,
      },
    });
  }, [meeting, session?.user?.id, history, clusters]);

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

  async function addObservation(draft: {
    text: string;
    media: CapturedMedia[];
    speaker?: CaptureSpeaker;
  }): Promise<boolean> {
    if (!session) return false;
    const attributed = formatObservationText(draft.text, draft.speaker ?? 'note');
    const prepared = buildObservationDraft(attributed || draft.text, draft.media);
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

  async function insertMediaRows(observationId: string | null, list: CapturedMedia[]): Promise<boolean> {
    if (!session) return false;
    const addBytes = list.reduce((sum, m) => sum + (m.size || 0), 0);
    if (addBytes > 0) {
      const quotaErr = await checkStorageQuota(session.user.id, addBytes);
      if (quotaErr) {
        setError(quotaErr);
        return false;
      }
    }
    let ok = true;
    for (const m of list) {
      let ref = m.uri;
      if (!isMediaRef(ref)) {
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
        if (isQuotaErrorMessage(error?.message)) {
          setError(STORAGE_FULL_MESSAGE);
        }
        ok = false;
      } else {
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

  async function addMediaToObservation(observationId: string, captured: CapturedMedia): Promise<boolean> {
    const ok = await insertMediaRows(observationId, [captured]);
    setError(ok ? null : "Couldn't save the media");
    await load();
    return ok;
  }

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
    if (table === 'meeting_observations') {
      const obsMedia = media.filter((m) => m.observation_id === id);
      for (const m of obsMedia) {
        if (m.local_uri) void deleteMediaBlob(m.local_uri);
        if (m.storage_path) void deleteCloudMedia(m.storage_path);
      }
    }
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error(error);
      setError("Couldn't delete that");
      return;
    }
    await load();
  }

  async function deleteMeeting() {
    if (!meeting || !confirm('Delete this meeting and all its notes?')) return;
    setSaving(true);
    for (const m of media) {
      if (m.local_uri) void deleteMediaBlob(m.local_uri);
      if (m.storage_path) void deleteCloudMedia(m.storage_path);
    }
    const { error } = await supabase.from('meetings').delete().eq('id', meeting.id);
    setSaving(false);
    if (error) {
      console.error(error);
      setError("Couldn't delete the meeting");
      return;
    }
    router.push('/meetings');
  }

  if (loading || entLoading) {
    return (
      <div className="app-shell">
        <div className="app-header">
          <Link href="/meetings" className="gear-btn" aria-label="Back">
            <BackIcon />
          </Link>
          <div className="app-title">Meeting</div>
          <GearMenu />
        </div>
        <div className="content">
          <p className="empty">Loading…</p>
        </div>
        <SurfaceNav active="meetings" />
      </div>
    );
  }

  if (!canMeetings) {
    return <MeetingsPlanGate />;
  }

  if (!meeting) {
    return (
      <div className="app-shell">
        <div className="app-header">
          <Link href="/meetings" className="gear-btn" aria-label="Back">
            <BackIcon />
          </Link>
          <div className="app-title">Meeting</div>
          <GearMenu />
        </div>
        <div className="content">
          <p className="empty">{error || 'Meeting not found'}</p>
        </div>
        <SurfaceNav active="meetings" />
      </div>
    );
  }

  const mediaByObservation = groupMediaByObservation(media);

  return (
    <div className="app-shell">
      <div className="app-header">
        <Link href="/meetings" className="gear-btn" aria-label="Back">
          <BackIcon />
        </Link>
        <div className="app-title">Meeting</div>
        <GearMenu />
      </div>

      <div className="content">
        {error && (
          <p className="meeting-capture-error" role="alert">
            {error}
          </p>
        )}
