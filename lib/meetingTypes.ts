// A Meeting is a block of time where people came together around a Job. The
// meeting row itself is the existing `meetings` table, extended additively:
// Today already counts it (start_time + duration_mins) and Outlook sync
// writes into it (source), so a Meeting is one identity shared by every
// surface — never a parallel copy. Everything beyond that identity lives in
// the related tables below, captured first and interpreted later.
export type MeetingSource = 'manual' | 'outlook';

export type Meeting = {
  id: string;
  user_id: string;
  text: string;
  duration_mins: number;
  start_time: string | null;
  source: MeetingSource;
  created_at: string;
  // Optional relationship to the Job the meeting was about. Same contract as
  // tasks.job_id: context, never a constraint; detaches (not deletes) when
  // the job goes away.
  job_id: string | null;
  // Optional relationship to the place the meeting happened. Same columns
  // tasks use; the row itself is self-sufficient without them.
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  // Raw capture notes — source evidence, deliberately unstructured.
  notes: string | null;
  // Derived minutes seam. Null in V1; a future derivation step fills it.
  summary: string | null;
};

// One person involved in the meeting. There is no Person entity in Dokkit
// today, so participants are freeform names; a future Person model can link
// here (meeting_participants.person_id) without changing this table's shape.
export type MeetingParticipant = {
  id: string;
  user_id: string;
  meeting_id: string;
  name: string;
  created_at: string;
};

// ONE contextual observation from the meeting. A photo + a voice note + a
// line of text captured together are a single observation (their media link
// back here via meeting_media.observation_id), not three disconnected rows.
export type MeetingObservation = {
  id: string;
  user_id: string;
  meeting_id: string;
  text: string;
  captured_at: string;
  created_at: string;
};

// Something the people in the meeting decided.
export type MeetingDecision = {
  id: string;
  user_id: string;
  meeting_id: string;
  text: string;
  created_at: string;
};

// Something the meeting produces that someone needs to do. A promoted action
// is ONE underlying action: task_id links it to the existing task, so the
// action appears on Today/Jobs/Travel through the task itself instead of a
// duplicated copy. Null until promoted.
export type MeetingAction = {
  id: string;
  user_id: string;
  meeting_id: string;
  text: string;
  created_at: string;
  task_id: string | null;
};

export type MeetingMediaType = 'photo' | 'audio' | 'document';

export type MediaSyncStatus = 'local_only' | 'uploading' | 'synced' | 'failed';

// Media attached to a meeting. local_uri is the device cache key (idb://);
// storage_path is the shared cloud object so every device can resolve bytes.
export type MeetingMedia = {
  id: string;
  user_id: string;
  meeting_id: string;
  observation_id: string | null;
  media_type: MeetingMediaType;
  local_uri: string;
  storage_path: string | null;
  sync_status: MediaSyncStatus;
  mime_type: string | null;
  size_bytes: number | null;
  captured_at: string;
  created_at: string;
};
