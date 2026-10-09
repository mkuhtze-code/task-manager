/**
 * Phase 3 — contextual reference resolution.
 *
 * Deterministic, evidence-aware resolver over the canonical CPU situation.
 * This is deliberately additive: it does not replace the existing speech or
 * engine reference resolvers and never silently acts on an ambiguous target.
 */

import type { EngineRequest, MemoryItem, WorkingMemorySnapshot } from '@/lib/engine';
import type { ContextEntity, CpuInput } from './types';

export type ContextReferenceStatus = 'resolved' | 'ambiguous' | 'unknown';

export type ContextReferenceCandidate = {
  id: string;
  kind: ContextEntity['kind'] | MemoryItem['type'];
  label: string;
  score: number;
  reasons: string[];
};

export type ContextReferenceResolution = {
  status: ContextReferenceStatus;
  phrase: string | null;
  target: ContextReferenceCandidate | null;
  candidates: ContextReferenceCandidate[];
  reason: string;
};

const REFERENCE_RE =
  /\b(this|that|it|these|those|the\s+last\s+one|the\s+other\s+one|the\s+previous\s+(?:one|task|job)|the\s+job|that\s+job|the\s+meeting|there|here)\b/i;

function phraseFor(text: string): string | null {
  // Location deixis is more specific than the generic pronoun in phrases
  // such as "do it there". Resolve the location cue rather than the earlier
  // "it", otherwise a task focus can incorrectly win.
  const locationPhrase = text.match(/\b(there|here)\b/i)?.[1];
  if (locationPhrase) return locationPhrase.toLowerCase();
  return text.match(REFERENCE_RE)?.[1].toLowerCase() ?? null;
}

function preferredKinds(phrase: string): string[] {
  if (/job/.test(phrase)) return ['job'];
  if (/meeting/.test(phrase)) return ['meeting'];
  if (/there|here/.test(phrase)) return ['location'];
  if (/task|one/.test(phrase)) return ['task', 'list_item', 'request'];
  return ['task', 'job', 'meeting', 'list_item', 'entity', 'request'];
}

function lexicalTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((x) => x.length > 2);
}

function lexicalOverlap(a: string, b: string): number {
  const aa = new Set(lexicalTokens(a));
  const bb = new Set(lexicalTokens(b));
  if (!aa.size || !bb.size) return 0;
  let hits = 0;
  for (const token of aa) if (bb.has(token)) hits += 1;
  return hits / Math.max(aa.size, bb.size);
}

function addCandidate(
  map: Map<string, ContextReferenceCandidate>,
  candidate: ContextReferenceCandidate
): void {
  const existing = map.get(candidate.id);
  if (!existing || candidate.score > existing.score) {
    map.set(candidate.id, candidate);
  } else if (candidate.score === existing.score) {
    existing.reasons = [...new Set([...existing.reasons, ...candidate.reasons])];
  }
}

function memoryCandidates(mem: WorkingMemorySnapshot): ContextReferenceCandidate[] {
  const out: ContextReferenceCandidate[] = [];
  const buckets: MemoryItem[][] = [
    mem.recentTasks,
    mem.recentJobs,
    mem.recentLocations,
    mem.recentEntities,
    mem.recentActions,
  ];
  for (const bucket of buckets) {
    for (const item of bucket) {
      out.push({
        id: item.id,
        kind: item.type,
        label: item.label,
        score: Math.max(0.05, Math.min(1, item.salience)),
        reasons: ['working_memory'],
      });
    }
  }
  if (mem.currentFocus.id && mem.currentFocus.label) {
    out.push({
      id: mem.currentFocus.id,
      kind: mem.currentFocus.kind === 'list' ? 'task' : (mem.currentFocus.kind === 'none' ? 'unknown' : mem.currentFocus.kind),
      label: mem.currentFocus.label,
      score: 1,
      reasons: ['current_focus'],
    });
  }
  return out;
}

function contextCandidates(input: CpuInput): ContextReferenceCandidate[] {
  const out: ContextReferenceCandidate[] = [];
  for (const job of input.context.jobs ?? []) {
    out.push({ id: job.id, kind: 'job', label: job.name, score: 0.55, reasons: ['current_context'] });
  }
  for (const meeting of input.context.meetings ?? []) {
    out.push({ id: meeting.id, kind: 'meeting', label: meeting.text, score: 0.55, reasons: ['current_context'] });
  }
  return out;
}

function timestampFor(mem: WorkingMemorySnapshot, id: string): number {
  const item = [
    ...mem.recentTasks,
    ...mem.recentJobs,
    ...mem.recentLocations,
    ...mem.recentEntities,
    ...mem.recentActions,
  ].find((x) => x.id === id);
  return item ? Date.parse(item.timestamp) || 0 : 0;
}

function requestTargetBonus(request: EngineRequest | null, label: string): string[] {
  if (!request) return [];
  const values = [
    request.objectText,
    request.relatedJobText,
    request.relatedMeetingText,
    request.locationText,
  ].filter(Boolean) as string[];
  return values.some((v) => lexicalOverlap(label, v) > 0.15)
    ? ['active_request_match']
    : [];
}

export function resolveContextReference(
  input: CpuInput,
  request: EngineRequest | null,
  workingMemory: WorkingMemorySnapshot
): ContextReferenceResolution {
  const phrase = phraseFor(input.input.text);
  if (!phrase) {
    return { status: 'unknown', phrase: null, target: null, candidates: [], reason: 'no_reference_phrase' };
  }

  const preferred = preferredKinds(phrase);
  const map = new Map<string, ContextReferenceCandidate>();
  for (const c of [...memoryCandidates(workingMemory), ...contextCandidates(input)]) {
    let score = c.score;
    const reasons = [...c.reasons];

    if (preferred.includes(c.kind)) {
      score += 0.35;
      reasons.push('type_match');
    }
    if (workingMemory.currentFocus.id === c.id) {
      score += 0.55;
      reasons.push('focus_match');
    }
    if (request && requestTargetBonus(request, c.label).length) {
      score += 0.1;
      reasons.push('active_request_match');
    }
    addCandidate(map, {
      ...c,
      score: Math.min(2, score),
      reasons,
    });
  }

  let candidates = [...map.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label)
  );

  if (/last|previous/.test(phrase)) {
    const dated = candidates
      .filter((c) => timestampFor(workingMemory, c.id) > 0)
      .sort((a, b) => timestampFor(workingMemory, b.id) - timestampFor(workingMemory, a.id));
    if (dated[0]) {
      return {
        status: 'resolved',
        phrase,
        target: dated[0],
        candidates: candidates.slice(0, 5),
        reason: 'explicit_recency_reference',
      };
    }
  }

  // “Here/there” is a location deixis, not a generic task pronoun. Do not let
  // a high-scoring current task focus override the grammatical target type.
  // If no location evidence exists, leave the reference unresolved rather than
  // silently binding it to an unrelated task.
  if (/^(?:there|here)$/.test(phrase)) {
    candidates = candidates.filter((candidate) => candidate.kind === 'location');
  }

  candidates = candidates.slice(0, 5);
  if (!candidates.length) {
    return { status: 'unknown', phrase, target: null, candidates, reason: 'no_context_candidates' };
  }

  const top = candidates[0];
  const second = candidates[1];
  const margin = top.score - (second?.score ?? 0);
  const strong = top.score >= 1.25;
  const clear = !second || margin >= 0.3;

  if (strong && clear) {
    return { status: 'resolved', phrase, target: top, candidates, reason: top.reasons.join(',') };
  }

  return {
    status: 'ambiguous',
    phrase,
    target: null,
    candidates,
    reason: second ? 'insufficient_margin_between_context_candidates' : 'candidate_not_strong_enough',
  };
}
