/**
 * Deterministic, utterance-local reference resolution.
 * Does not invent entities outside the utterance / provided prior context.
 */

import type { Confidence } from '../types';
import type { ReferenceResolution, SemanticAct } from './types';

const PRONOUN_RE = /\b(him|her|them|it|that|this)\b/gi;

export type PriorEntity = {
  label: string;
  kind: 'person' | 'job' | 'task' | 'meeting' | 'quote' | 'thing' | 'unknown';
  actId?: string;
};

export function entitiesFromActs(acts: SemanticAct[]): PriorEntity[] {
  const out: PriorEntity[] = [];
  for (const a of acts) {
    if (a.sourceSpeaker) {
      out.push({ label: a.sourceSpeaker, kind: 'person', actId: a.id });
    }
    if (a.objectText) {
      const obj = a.objectText.trim();
      const person = obj.match(/^([A-Z][a-z]+)(?:\s|$)/);
      if (person && a.actionVerb && /call|email|meet|message|text|send/.test(a.actionVerb)) {
        out.push({ label: person[1], kind: 'person', actId: a.id });
      }
      if (/\bjob\b/i.test(obj) || /\b(extension|roof|kitchen|bathroom)\b/i.test(obj)) {
        out.push({ label: obj.slice(0, 60), kind: 'job', actId: a.id });
      }
      if (/\bquote\b/i.test(obj)) {
        out.push({ label: obj.slice(0, 60), kind: 'quote', actId: a.id });
      }
      if (/\bmeeting\b/i.test(obj)) {
        out.push({ label: obj.slice(0, 60), kind: 'meeting', actId: a.id });
      }
      if (/\btask\b/i.test(obj)) {
        out.push({ label: obj.slice(0, 60), kind: 'task', actId: a.id });
      }
    }
    const jobFor = a.rawSpan.match(/\b(?:job|task)\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (jobFor) {
      out.push({ label: jobFor[1], kind: 'job', actId: a.id });
    }
  }
  return out;
}

function resolveOne(
  pronoun: string,
  priors: PriorEntity[],
  clause: string
): ReferenceResolution {
  const p = pronoun.toLowerCase();
  const people = priors.filter((e) => e.kind === 'person');
  const jobs = priors.filter((e) => e.kind === 'job' || e.kind === 'task');
  const quotes = priors.filter((e) => e.kind === 'quote');
  const meetings = priors.filter((e) => e.kind === 'meeting');

  if (/\bthe\s+job\b/i.test(clause) && jobs.length === 1) {
    return {
      pronoun: p,
      resolvedTo: jobs[0].label,
      candidateIds: jobs.map((j) => j.label),
      confidence: 'high',
      requiresClarification: false,
    };
  }
  if (/\bthe\s+quote\b/i.test(clause) && quotes.length === 1) {
    return {
      pronoun: p,
      resolvedTo: quotes[0].label,
      candidateIds: quotes.map((j) => j.label),
      confidence: 'high',
      requiresClarification: false,
    };
  }
  if (/\bthe\s+meeting\b/i.test(clause) && meetings.length === 1) {
    return {
      pronoun: p,
      resolvedTo: meetings[0].label,
      candidateIds: meetings.map((j) => j.label),
      confidence: 'high',
      requiresClarification: false,
    };
  }

  if (p === 'him' || p === 'her') {
    if (people.length === 1) {
      return {
        pronoun: p,
        resolvedTo: people[0].label,
        candidateIds: [people[0].label],
        confidence: 'high',
        requiresClarification: false,
      };
    }
    if (people.length > 1) {
      return {
        pronoun: p,
        resolvedTo: null,
        candidateIds: people.map((x) => x.label),
        confidence: 'low',
        requiresClarification: true,
      };
    }
    return {
      pronoun: p,
      resolvedTo: null,
      candidateIds: [],
      confidence: 'low',
      requiresClarification: true,
    };
  }

  if (p === 'them') {
    if (people.length >= 1) {
      return {
        pronoun: p,
        resolvedTo: people.length === 1 ? people[0].label : null,
        candidateIds: people.map((x) => x.label),
        confidence: people.length === 1 ? 'medium' : 'low',
        requiresClarification: people.length !== 1,
      };
    }
  }

  if (p === 'it' || p === 'that' || p === 'this') {
    const objects = [...jobs, ...quotes, ...meetings, ...priors.filter((e) => e.kind === 'thing')];
    if (objects.length === 1) {
      return {
        pronoun: p,
        resolvedTo: objects[0].label,
        candidateIds: [objects[0].label],
        confidence: 'medium',
        requiresClarification: false,
      };
    }
    if (objects.length > 1) {
      const last = objects[objects.length - 1];
      return {
        pronoun: p,
        resolvedTo: last.label,
        candidateIds: objects.map((o) => o.label),
        confidence: 'low',
        requiresClarification: true,
      };
    }
    if (people.length === 1 && p === 'that') {
      return {
        pronoun: p,
        resolvedTo: null,
        candidateIds: people.map((x) => x.label),
        confidence: 'low',
        requiresClarification: true,
      };
    }
    return {
      pronoun: p,
      resolvedTo: null,
      candidateIds: [],
      confidence: 'low',
      requiresClarification: true,
    };
  }

  return {
    pronoun: p,
    resolvedTo: null,
    candidateIds: [],
    confidence: 'low',
    requiresClarification: true,
  };
}

export function resolveReferencesInActs(acts: SemanticAct[]): SemanticAct[] {
  const resolved: SemanticAct[] = [];
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const priors = entitiesFromActs(resolved);
    const refs: ReferenceResolution[] = [];
    const matches = [...act.rawSpan.matchAll(PRONOUN_RE)];
    for (const m of matches) {
      refs.push(resolveOne(m[1], priors, act.rawSpan));
    }
    if (/\bthe\s+(job|quote|meeting|task)\b/i.test(act.rawSpan)) {
      const noun = act.rawSpan.match(/\bthe\s+(job|quote|meeting|task)\b/i)?.[1] ?? 'job';
      refs.push(resolveOne(noun === 'job' || noun === 'task' ? 'it' : 'that', priors, act.rawSpan));
    }

    const needsClarify = refs.some((r) => r.requiresClarification);
    resolved.push({
      ...act,
      references: refs.length ? refs : act.references,
      requiresClarification: act.requiresClarification || needsClarify,
      evidence: needsClarify
        ? [...act.evidence, { signal: 'ambiguous_reference', source: 'references' }]
        : act.evidence,
    });
  }
  return resolved;
}

export type { Confidence };
