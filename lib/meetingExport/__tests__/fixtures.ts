import type {
  Meeting,
  MeetingAction,
  MeetingDecision,
  MeetingMedia,
  MeetingObservation,
  MeetingParticipant,
} from '@/lib/meetingTypes';
import type {
  MeetingExportActionContent,
  MeetingExportContent,
  MeetingExportMask,
  MeetingExportRecord,
  MeetingExportSections,
} from '@/lib/meetingExport';

const NOW = '2025-01-02T09:00:00';

export function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'meeting-1',
    user_id: 'user-1',
    text: 'Site visit — foundation',
    duration_mins: 90,
    start_time: '2025-01-02T09:00:00',
    source: 'manual',
    created_at: '2025-01-02T08:00:00',
    job_id: 'job-1',
    location_text: 'Site 4B',
    lat: null,
    lng: null,
    notes: 'Check the rebar spacing against the drawings.',
    summary: null,
    ...overrides,
  };
}

export function makeParticipant(name: string, overrides: Partial<MeetingParticipant> = {}): MeetingParticipant {
  return {
    id: `p-${name.toLowerCase()}`,
    user_id: 'user-1',
    meeting_id: 'meeting-1',
    name,
    created_at: NOW,
    ...overrides,
  };
}

export function makeObservation(id: string, overrides: Partial<MeetingObservation> = {}): MeetingObservation {
  return {
    id,
    user_id: 'user-1',
    meeting_id: 'meeting-1',
    text: `Observation ${id}`,
    captured_at: '2025-01-02T09:15:00',
    created_at: NOW,
    ...overrides,
  };
}

export function makeMedia(
  id: string,
  observationId: string | null,
  mediaType: MeetingMedia['media_type'],
  overrides: Partial<MeetingMedia> = {}
): MeetingMedia {
  const iso = mediaType === 'audio' ? '2025-01-02T09:20:00' : '2025-01-02T09:18:00';
  return {
    id,
    user_id: 'user-1',
    meeting_id: 'meeting-1',
    observation_id: observationId,
    media_type: mediaType,
    local_uri: `idb://${id}`,
    mime_type: mediaType === 'photo' ? 'image/png' : 'audio/m4a',
    size_bytes: mediaType === 'photo' ? 4096 : 1024,
    captured_at: iso,
    created_at: NOW,
    ...overrides,
  };
}

export function makeDecision(id: string, text = `Decision ${id}`): MeetingDecision {
  return { id, user_id: 'user-1', meeting_id: 'meeting-1', text, created_at: NOW };
}

export function makeAction(id: string, text = `Action ${id}`, taskId: string | null = null): MeetingAction {
  return { id, user_id: 'user-1', meeting_id: 'meeting-1', text, created_at: NOW, task_id: taskId };
}

export type ContentOverrides = {
  meeting?: Meeting;
  job?: { id: string; name: string } | null;
  participants?: MeetingParticipant[];
  observations?: MeetingExportContent['observations'];
  decisions?: MeetingDecision[];
  actions?: MeetingExportActionContent[];
};

export function makeContent(overrides: ContentOverrides = {}): MeetingExportContent {
  return {
    meeting: makeMeeting(),
    job: { id: 'job-1', name: 'Acme Renovation' },
    participants: [makeParticipant('Alice'), makeParticipant('Bob')],
    observations: [
      {
        observation: makeObservation('obs-1'),
        media: [makeMedia('media-1', 'obs-1', 'photo'), makeMedia('media-2', 'obs-1', 'audio')],
      },
      {
        observation: makeObservation('obs-2', { captured_at: '2025-01-02T09:30:00' }),
        media: [makeMedia('media-3', 'obs-2', 'photo')],
      },
    ],
    decisions: [makeDecision('dec-1', 'Pour the slab on Thursday regardless of the weather')],
    actions: [{ action: makeAction('act-1', 'Call the structural engineer', 'task-1'), task: { id: 'task-1', text: 'Call structural engineer re. rebar lap' } }],
    ...overrides,
  };
}

// The selection snapshot a "both, everything included" export stores.
export function fullSections(): MeetingExportSections {
  return {
    mask: { participants: true, notes: false, observations: true, decisions: true, actions: true },
    includeParticipants: true,
    includeNotes: false,
    observationIds: ['obs-1', 'obs-2'],
    mediaIds: ['media-1', 'media-2', 'media-3'],
    decisionIds: ['dec-1'],
    actionIds: ['act-1'],
  };
}

export function makeMask(overrides: Partial<MeetingExportMask> = {}): MeetingExportMask {
  return { participants: true, notes: false, observations: true, decisions: true, actions: true, ...overrides };
}

export function makeRecord(
  overrides: Partial<MeetingExportRecord> = {},
  fingerprint: string | null = 'fp-abc',
  sections: MeetingExportSections | null = fullSections()
): MeetingExportRecord {
  return {
    id: 'rec-1',
    user_id: 'user-1',
    meeting_id: 'meeting-1',
    status: 'successful',
    export_type: 'both',
    fingerprint,
    selected_sections: sections,
    observation_count: 2,
    photo_count: 2,
    audio_count: 1,
    decision_count: 1,
    action_count: 1,
    participant_count: 2,
    transcription_requested: false,
    transcription_status: 'not_requested',
    missing_media_count: 0,
    file_size: 123456,
    error_reason: null,
    created_at: '2025-01-02T10:00:00',
    ...overrides,
  };
}