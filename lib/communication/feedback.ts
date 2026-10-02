import type {
  ActionReviewSession,
  LearningEvidence,
  MeetingCorrectionFeedback,
  PersonalCommunicationProfile,
  ReviewItem,
  TaskOutcomeFeedback,
} from './types';
import { applyEvidence, normalisePhrase } from './learning';

export type FeedbackBatchResult = {
  profile: PersonalCommunicationProfile;
  applied: LearningEvidence[];
  skipped: number;
};

export function feedbackFromReviewSession(
  profile: PersonalCommunicationProfile,
  session: ActionReviewSession
): FeedbackBatchResult {
  const applied: LearningEvidence[] = [];
  let next = profile;
  let skipped = 0;

  for (const item of session.items) {
    if (item.status === 'pending') {
      skipped += 1;
      continue;
    }
    const signals = evidenceFromReviewItem(profile.userId, item, session.meetingId);
    for (const ev of signals) {
      next = applyEvidence(next, ev);
      applied.push(ev);
    }
  }
  return { profile: next, applied, skipped };
}

export function feedbackFromMeetingCorrection(
  profile: PersonalCommunicationProfile,
  correction: MeetingCorrectionFeedback
): FeedbackBatchResult {
  if (correction.userId !== profile.userId) {
    return { profile, applied: [], skipped: 1 };
  }
  const phrase = normalisePhrase(correction.originalInterpretation);
  const meaning = normalisePhrase(correction.correctedValue) || correction.correctedValue;
  if (!phrase) return { profile, applied: [], skipped: 1 };

  const evidence: LearningEvidence = {
    userId: correction.userId,
    kind: 'meeting_correction',
    phrase,
    meaning,
    weight: 3,
    observedAt: correction.observedAt,
    detail: {
      originalInterpretation: correction.originalInterpretation,
      correctedValue: correction.correctedValue,
      reason: correction.reason,
      meetingId: correction.meetingId,
    },
  };
  return { profile: applyEvidence(profile, evidence), applied: [evidence], skipped: 0 };
}

export function feedbackFromTaskOutcome(
  profile: PersonalCommunicationProfile,
  outcome: TaskOutcomeFeedback
): FeedbackBatchResult {
  if (outcome.userId !== profile.userId) {
    return { profile, applied: [], skipped: 1 };
  }
  const phrase = normalisePhrase(outcome.taskText);
  if (!phrase) return { profile, applied: [], skipped: 1 };

  const evidence: LearningEvidence = {
    userId: outcome.userId,
    kind: 'task_outcome',
    phrase,
    meaning:
      outcome.outcome === 'edited' && outcome.editedText
        ? normalisePhrase(outcome.editedText)
        : phrase,
    observedAt: outcome.observedAt,
    detail: {
      taskId: outcome.taskId,
      meetingId: outcome.meetingId,
      outcome: outcome.outcome,
      correctedValue: outcome.editedText,
    },
  };
  return { profile: applyEvidence(profile, evidence), applied: [evidence], skipped: 0 };
}

export function processLearningFeedback(
  profile: PersonalCommunicationProfile,
  input: {
    reviewSession?: ActionReviewSession | null;
    meetingCorrections?: MeetingCorrectionFeedback[];
    taskOutcomes?: TaskOutcomeFeedback[];
  }
): FeedbackBatchResult {
  let next = profile;
  const applied: LearningEvidence[] = [];
  let skipped = 0;

  if (input.reviewSession) {
    const r = feedbackFromReviewSession(next, input.reviewSession);
    next = r.profile;
    applied.push(...r.applied);
    skipped += r.skipped;
  }
  for (const c of input.meetingCorrections ?? []) {
    const r = feedbackFromMeetingCorrection(next, c);
    next = r.profile;
    applied.push(...r.applied);
    skipped += r.skipped;
  }
  for (const o of input.taskOutcomes ?? []) {
    const r = feedbackFromTaskOutcome(next, o);
    next = r.profile;
    applied.push(...r.applied);
    skipped += r.skipped;
  }
  return { profile: next, applied, skipped };
}

function evidenceFromReviewItem(
  userId: string,
  item: ReviewItem,
  meetingId: string
): LearningEvidence[] {
  const out: LearningEvidence[] = [];
  const phrase = normalisePhrase(item.originalText || item.rawText);
  if (!phrase) return out;

  if (item.status === 'accepted') {
    out.push({
      userId,
      kind: 'accepted_interpretation',
      phrase,
      meaning: normalisePhrase(item.text) || phrase,
      weight: 1,
      detail: { meetingId, originalInterpretation: item.originalText },
    });
  } else if (item.status === 'edited') {
    out.push({
      userId,
      kind: 'explicit_correction',
      phrase,
      meaning: normalisePhrase(item.text) || item.text,
      weight: 3,
      detail: {
        meetingId,
        originalInterpretation: item.originalText,
        correctedValue: item.text,
        reason: 'User edited review item',
      },
    });
  } else if (item.status === 'rejected') {
    out.push({
      userId,
      kind: 'rejected_interpretation',
      phrase,
      meaning: normalisePhrase(item.text) || phrase,
      weight: 2,
      detail: { meetingId, originalInterpretation: item.originalText },
    });
  }
  return out;
}
