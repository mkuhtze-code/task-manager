import type {
  ActionReviewSession,
  MeetingUnderstanding,
  ReviewItem,
  ReviewTargetKind,
  TaskDraft,
} from './types';

export type CreateReviewSessionOptions = {
  jobId?: string | null;
  defaultEstimateMins?: number;
  includeObservations?: boolean;
  includeDecisions?: boolean;
  includeActions?: boolean;
};

export function createReviewSession(
  understanding: MeetingUnderstanding,
  options: CreateReviewSessionOptions = {}
): ActionReviewSession {
  const {
    jobId = null,
    includeObservations = false,
    includeDecisions = true,
    includeActions = true,
  } = options;

  const items: ReviewItem[] = [];
  let seq = 0;

  if (includeActions) {
    for (const c of understanding.candidates.actions) {
      seq += 1;
      items.push({
        id: `rev-action-${seq}`,
        meetingId: understanding.meetingId,
        eventId: c.eventId,
        targetKind: 'task',
        text: c.text,
        originalText: c.text,
        rawText: c.text,
        status: 'pending',
        certainty: 'UNKNOWN',
        confidence: 'medium',
        requiresConfirmation: c.requiresConfirmation,
        jobId,
        estimateMins: options.defaultEstimateMins ?? null,
      });
    }
  }

  if (includeDecisions) {
    for (const d of understanding.candidates.decisions) {
      seq += 1;
      items.push({
        id: `rev-decision-${seq}`,
        meetingId: understanding.meetingId,
        eventId: d.eventId,
        targetKind: 'meeting_decision',
        text: d.text,
        originalText: d.text,
        rawText: d.text,
        status: 'pending',
        certainty: d.certainty,
        confidence: 'medium',
        requiresConfirmation: d.certainty !== 'CONFIRMED',
        jobId,
        estimateMins: null,
      });
    }
  }

  if (includeObservations) {
    for (const o of understanding.candidates.observations) {
      seq += 1;
      items.push({
        id: `rev-obs-${seq}`,
        meetingId: understanding.meetingId,
        eventId: o.eventId,
        targetKind: 'meeting_observation',
        text: o.text,
        originalText: o.text,
        rawText: o.text,
        status: 'pending',
        certainty: 'UNKNOWN',
        confidence: 'medium',
        requiresConfirmation: false,
        jobId,
        estimateMins: null,
      });
    }
  }

  return {
    id: `review-${understanding.meetingId}-${Date.now()}`,
    meetingId: understanding.meetingId,
    jobId,
    items,
    createdAt: new Date().toISOString(),
    isComplete: items.length === 0,
  };
}

function updateItem(
  session: ActionReviewSession,
  itemId: string,
  fn: (item: ReviewItem) => ReviewItem
): ActionReviewSession {
  const items = session.items.map((item) => (item.id === itemId ? fn(item) : item));
  const isComplete = items.length === 0 || items.every((i) => i.status !== 'pending');
  return { ...session, items, isComplete };
}

export function acceptItem(
  session: ActionReviewSession,
  itemId: string,
  edits?: { text?: string; estimateMins?: number | null; jobId?: string | null }
): ActionReviewSession {
  return updateItem(session, itemId, (item) => {
    const text = edits?.text?.trim() || item.text;
    const edited = text !== item.originalText;
    return {
      ...item,
      text,
      status: edited ? 'edited' : 'accepted',
      estimateMins: edits?.estimateMins !== undefined ? edits.estimateMins : item.estimateMins,
      jobId: edits?.jobId !== undefined ? edits.jobId : item.jobId,
    };
  });
}

export function rejectItem(session: ActionReviewSession, itemId: string): ActionReviewSession {
  return updateItem(session, itemId, (item) => ({ ...item, status: 'rejected' }));
}

export function acceptAll(session: ActionReviewSession): ActionReviewSession {
  let next = session;
  for (const item of session.items) {
    if (item.status === 'pending') next = acceptItem(next, item.id);
  }
  return next;
}

export function rejectAll(session: ActionReviewSession): ActionReviewSession {
  let next = session;
  for (const item of session.items) {
    if (item.status === 'pending') next = rejectItem(next, item.id);
  }
  return next;
}

export function finaliseReview(
  session: ActionReviewSession,
  options?: { defaultEstimateMins?: number }
): {
  session: ActionReviewSession;
  taskDrafts: TaskDraft[];
  decisionDrafts: { text: string; meetingId: string; eventId: string }[];
  meetingActionDrafts: { text: string; meetingId: string; eventId: string }[];
} {
  const defaultEstimate = options?.defaultEstimateMins ?? 30;
  const taskDrafts: TaskDraft[] = [];
  const decisionDrafts: { text: string; meetingId: string; eventId: string }[] = [];
  const meetingActionDrafts: { text: string; meetingId: string; eventId: string }[] = [];

  for (const item of session.items) {
    if (item.status !== 'accepted' && item.status !== 'edited') continue;
    if (item.targetKind === 'task') {
      meetingActionDrafts.push({
        text: item.text,
        meetingId: item.meetingId,
        eventId: item.eventId,
      });
      taskDrafts.push({
        text: item.text,
        original_input: item.rawText || item.originalText,
        job_id: item.jobId,
        estimate_mins: item.estimateMins ?? defaultEstimate,
        source: 'came_up',
        status: 'pending',
        due_today: false,
        surface_date: null,
        intended_time: null,
        info: '',
        meeting_id: item.meetingId,
        meeting_action_event_id: item.eventId,
      });
    } else if (item.targetKind === 'meeting_decision') {
      decisionDrafts.push({
        text: item.text,
        meetingId: item.meetingId,
        eventId: item.eventId,
      });
    }
  }

  return { session, taskDrafts, decisionDrafts, meetingActionDrafts };
}

export function reviewSummary(session: ActionReviewSession): {
  total: number;
  pending: number;
  accepted: number;
  edited: number;
  rejected: number;
  byKind: Record<ReviewTargetKind, number>;
} {
  const byKind: Record<ReviewTargetKind, number> = {
    task: 0,
    meeting_action: 0,
    meeting_decision: 0,
    meeting_observation: 0,
  };
  let pending = 0,
    accepted = 0,
    edited = 0,
    rejected = 0;
  for (const item of session.items) {
    byKind[item.targetKind] += 1;
    if (item.status === 'pending') pending += 1;
    else if (item.status === 'accepted') accepted += 1;
    else if (item.status === 'edited') edited += 1;
    else if (item.status === 'rejected') rejected += 1;
  }
  return { total: session.items.length, pending, accepted, edited, rejected, byKind };
}
