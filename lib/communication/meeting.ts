import { understand } from './understand';
import type { MeetingUnderstanding, MeetingUtterance, SpeakerRole, UnderstoodItem } from './types';
import { emptyMeetingUnderstanding } from './types';

export type ProcessMeetingOptions = { today?: string; jobId?: string | null };

export function processMeetingConversation(
  meetingId: string,
  utterances: MeetingUtterance[],
  options: ProcessMeetingOptions = {}
): MeetingUnderstanding {
  const result = emptyMeetingUnderstanding(meetingId);
  if (utterances.length === 0) return result;

  const items = utterances.map((u, i) => {
    const id = u.id ?? `utt-${i + 1}`;
    const meaning = understand(u.rawText, {
      today: options.today,
      speakerHint: u.speaker,
    });
    const item: UnderstoodItem = {
      id: `item-${id}`,
      eventId: id,
      text: u.rawText.replace(/\s+/g, ' ').trim(),
      rawText: u.rawText,
      statementType: meaning.statementType,
      certainty: meaning.certainty,
      confidence: meaning.confidence,
      speaker: u.speaker,
      requiresConfirmation: meaning.requiresConfirmation,
      linkedObjectId: null,
    };
    bucket(result, item, u.speaker);
    return { u, id, meaning, item };
  });

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (cur.u.speaker !== 'CUSTOMER') continue;
    if (cur.meaning.statementType !== 'QUESTION' && cur.meaning.statementType !== 'REQUEST') {
      continue;
    }
    for (let j = i + 1; j < items.length; j++) {
      const resp = items[j];
      if (resp.u.speaker === 'CUSTOMER') break;
      if (resp.u.speaker !== 'CONTRACTOR' && resp.u.speaker !== 'TEAM_MEMBER') continue;
      const c = resp.meaning.certainty;
      if (c === 'PROVISIONAL' || c === 'NEEDS_CHECK' || c === 'UNKNOWN') {
        const q = cur.u.rawText.replace(/\s+/g, ' ').trim().replace(/\?+$/, '');
        const actionText = c === 'NEEDS_CHECK' ? `Check: ${q}` : `Confirm: ${q}`;
        if (!result.actions.some((a) => a.text === actionText)) {
          result.actions.push({
            id: `action-pair-${cur.id}`,
            eventId: resp.id,
            text: actionText,
            rawText: resp.u.rawText,
            statementType: 'FOLLOW_UP',
            certainty: c,
            confidence: resp.meaning.confidence,
            speaker: resp.u.speaker,
            requiresConfirmation: true,
            linkedObjectId: null,
          });
        }
        if (!result.unresolved.some((u) => u.eventId === resp.id)) {
          result.unresolved.push({
            id: `unres-${resp.id}`,
            eventId: resp.id,
            text: `${q} — ${c === 'NEEDS_CHECK' ? 'to be confirmed' : 'subject to confirmation'}`,
            rawText: resp.u.rawText,
            statementType: resp.meaning.statementType,
            certainty: c,
            confidence: resp.meaning.confidence,
            speaker: resp.u.speaker,
            requiresConfirmation: true,
            linkedObjectId: null,
          });
        }
      }
      if (!result.responses.some((r) => r.eventId === resp.id)) {
        result.responses.push(resp.item);
      }
      break;
    }
  }

  const seen = new Set<string>();
  for (const a of result.actions) {
    const k = a.text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    result.candidates.actions.push({
      text: a.text,
      eventId: a.eventId,
      requiresConfirmation: a.requiresConfirmation,
    });
  }
  for (const o of [...result.observations, ...result.requirements, ...result.preferences]) {
    if (!result.candidates.observations.some((c) => c.eventId === o.eventId)) {
      result.candidates.observations.push({ text: o.text, eventId: o.eventId });
    }
  }
  for (const d of result.decisions) {
    result.candidates.decisions.push({
      text: d.text,
      eventId: d.eventId,
      certainty: d.certainty,
    });
  }
  for (const c of result.commitments) {
    if (
      c.certainty === 'CONFIRMED' &&
      !result.candidates.decisions.some((d) => d.eventId === c.eventId)
    ) {
      result.candidates.decisions.push({
        text: c.text,
        eventId: c.eventId,
        certainty: c.certainty,
      });
    }
  }
  return result;
}

function bucket(result: MeetingUnderstanding, item: UnderstoodItem, speaker: SpeakerRole): void {
  const st = item.statementType;
  if (speaker === 'CUSTOMER' || speaker === 'UNKNOWN') {
    if (st === 'REQUIREMENT' || st === 'CONSTRAINT') result.requirements.push(item);
    else if (st === 'PREFERENCE') result.preferences.push(item);
    else if (st === 'QUESTION' || st === 'REQUEST') result.questions.push(item);
    else if (st === 'OBSERVATION') result.observations.push(item);
  }
  if (speaker === 'CONTRACTOR' || speaker === 'TEAM_MEMBER') {
    if (st === 'ANSWER' || st === 'CONFIRMATION') result.responses.push(item);
    else if (st === 'COMMITMENT') result.commitments.push(item);
    else if (st === 'DECISION') result.decisions.push(item);
  }
  if (st === 'COMMITMENT' && !result.commitments.some((c) => c.eventId === item.eventId)) {
    result.commitments.push(item);
  }
  if (st === 'TASK' || st === 'FOLLOW_UP') {
    if (!result.actions.some((a) => a.eventId === item.eventId)) result.actions.push(item);
  }
  if (
    (speaker === 'CONTRACTOR' || speaker === 'TEAM_MEMBER') &&
    (item.certainty === 'PROVISIONAL' || item.certainty === 'NEEDS_CHECK')
  ) {
    if (!result.unresolved.some((u) => u.eventId === item.eventId)) result.unresolved.push(item);
    if (!result.responses.some((r) => r.eventId === item.eventId)) result.responses.push(item);
  }
}
