/**
 * Deterministic reference resolution.
 * Combines utterance-local priors with optional Dokkit SpeechUnderstandingContext.
 */

import type { Confidence } from '../types';
import type { ReferenceResolution, SemanticAct } from './types';
import {
  type SpeechUnderstandingContext,
  linkEntitiesInText,
  resolveFocusReference,
} from './context';

const PRONOUN_RE = /\b(him|her|them|it|that|this)\b/gi;

export type PriorEntity = {
  label: string;
  kind: 'person' | 'job' | 'task' | 'meeting' | 'quote' | 'thing' | 'unknown';
  actId?: string;
  entityId?: string;
};

export function entitiesFromActs(acts: SemanticAct[]): PriorEntity[] {
  const out: PriorEntity[] = [];
  for (const a of acts) {
    if (a.sourceSpeaker) out.push({ label: a.sourceSpeaker, kind: 'person', actId: a.id });
    for (const link of a.entityLinks ?? []) {
      out.push({
        label: link.label,
        kind: link.kind === 'place' ? 'thing' : link.kind,
        actId: a.id,
        entityId: link.entityId,
      });
    }
    if (a.objectText) {
      const obj = a.objectText.trim();
      const person = obj.match(/^([A-Z][a-z]+)(?:\s|$)/);
      if (person && a.actionVerb && /call|email|meet|message|text|send/.test(a.actionVerb)) {
        out.push({ label: person[1], kind: 'person', actId: a.id });
      }
      if (/\bjob\b/i.test(obj)) out.push({ label: obj.slice(0, 60), kind: 'job', actId: a.id });
      if (/\bquote\b/i.test(obj)) out.push({ label: obj.slice(0, 60), kind: 'quote', actId: a.id });
      if (/\bmeeting\b/i.test(obj)) out.push({ label: obj.slice(0, 60), kind: 'meeting', actId: a.id });
      if (/\btask\b/i.test(obj)) out.push({ label: obj.slice(0, 60), kind: 'task', actId: a.id });
    }
  }
  return out;
}

function resolveOne(
  pronoun: string,
  priors: PriorEntity[],
  clause: string,
  ctx?: SpeechUnderstandingContext | null
): ReferenceResolution {
  const p = pronoun.toLowerCase();

  if (['it', 'that', 'this'].includes(p)) {
    const focus = resolveFocusReference(p, ctx);
    if (focus && focus.confidence !== 'low') {
      return {
        pronoun: p,
        resolvedTo: focus.label,
        candidateIds: [focus.entityId],
        confidence: focus.confidence,
        requiresClarification: false,
      };
    }
  }

  const people = priors.filter((e) => e.kind === 'person');
  const jobs = priors.filter((e) => e.kind === 'job' || e.kind === 'task');
  const quotes = priors.filter((e) => e.kind === 'quote');
  const meetings = priors.filter((e) => e.kind === 'meeting');

  if (/\bthe\s+job\b/i.test(clause) && jobs.length === 1) {
    return {
      pronoun: p,
      resolvedTo: jobs[0].label,
      candidateIds: jobs[0].entityId ? [jobs[0].entityId] : [jobs[0].label],
      confidence: 'high',
      requiresClarification: false,
    };
  }
  if (/\bthe\s+job\b/i.test(clause) && ctx?.jobs?.length === 1) {
    return {
      pronoun: p,
      resolvedTo: ctx.jobs[0].label,
      candidateIds: [ctx.jobs[0].id],
      confidence: 'high',
      requiresClarification: false,
    };
  }
  if (/\bthe\s+meeting\b/i.test(clause) && meetings.length === 1) {
    return {
      pronoun: p,
      resolvedTo: meetings[0].label,
      candidateIds: [meetings[0].label],
      confidence: 'high',
      requiresClarification: false,
    };
  }

  if (p === 'him' || p === 'her') {
    if (people.length === 1) {
      return {
        pronoun: p,
        resolvedTo: people[0].label,
        candidateIds: people[0].entityId ? [people[0].entityId] : [people[0].label],
        confidence: 'high',
        requiresClarification: false,
      };
    }
    if (ctx?.people?.length === 1 && people.length === 0) {
      return {
        pronoun: p,
        resolvedTo: ctx.people[0].label,
        candidateIds: [ctx.people[0].id],
        confidence: 'medium',
        requiresClarification: false,
      };
    }
    if (people.length > 1) {
      return {
        pronoun: p,
        resolvedTo: null,
        candidateIds: people.map((x) => x.entityId ?? x.label),
        confidence: 'low',
        requiresClarification: true,
      };
    }
    return { pronoun: p, resolvedTo: null, candidateIds: [], confidence: 'low', requiresClarification: true };
  }

  if (p === 'it' || p === 'that' || p === 'this') {
    const objects = [...jobs, ...quotes, ...meetings];
    if (objects.length === 1) {
      return {
        pronoun: p,
        resolvedTo: objects[0].label,
        candidateIds: objects[0].entityId ? [objects[0].entityId] : [objects[0].label],
        confidence: 'medium',
        requiresClarification: false,
      };
    }
    if (objects.length > 1) {
      const last = objects[objects.length - 1];
      return {
        pronoun: p,
        resolvedTo: last.label,
        candidateIds: objects.map((o) => o.entityId ?? o.label),
        confidence: 'low',
        requiresClarification: true,
      };
    }
    return { pronoun: p, resolvedTo: null, candidateIds: [], confidence: 'low', requiresClarification: true };
  }

  return { pronoun: p, resolvedTo: null, candidateIds: [], confidence: 'low', requiresClarification: true };
}

export function resolveReferencesInActs(
  acts: SemanticAct[],
  ctx?: SpeechUnderstandingContext | null
): SemanticAct[] {
  const resolved: SemanticAct[] = [];
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const priors = entitiesFromActs(resolved);
    const refs: ReferenceResolution[] = [];
    for (const m of act.rawSpan.matchAll(PRONOUN_RE)) {
      refs.push(resolveOne(m[1], priors, act.rawSpan, ctx));
    }
    if (/\bthe\s+(job|quote|meeting|task)\b/i.test(act.rawSpan)) {
      const noun = act.rawSpan.match(/\bthe\s+(job|quote|meeting|task)\b/i)?.[1] ?? 'job';
      refs.push(resolveOne(noun === 'job' || noun === 'task' ? 'it' : 'that', priors, act.rawSpan, ctx));
    }

    const links = linkEntitiesInText(act.rawSpan, ctx);
    for (const r of refs) {
      if (r.resolvedTo && r.confidence !== 'low' && r.candidateIds.length === 1) {
        const id = r.candidateIds[0];
        if (!links.some((l) => l.entityId === id)) {
          const fromCtx = [
            ...(ctx?.people ?? []),
            ...(ctx?.jobs ?? []),
            ...(ctx?.tasks ?? []),
            ...(ctx?.meetings ?? []),
          ].find((e) => e.id === id || e.label === r.resolvedTo);
          if (fromCtx) {
            links.push({
              entityId: fromCtx.id,
              label: fromCtx.label,
              kind: fromCtx.kind,
              matchedSpan: r.pronoun,
              confidence: r.confidence,
              source: 'pronoun',
            });
          }
        }
      }
    }

    const needsClarify =
      refs.some((r) => r.requiresClarification) ||
      links.filter((l) => l.kind === 'person' && l.confidence === 'high').length > 1;

    const targetsExisting =
      links.some((l) => l.kind === 'job' || l.kind === 'task' || l.kind === 'meeting') &&
      /\b(?:move|update|push|postpone|add|attach|put)\b/i.test(act.rawSpan);

    resolved.push({
      ...act,
      references: refs.length ? refs : act.references,
      entityLinks: links.length ? links : act.entityLinks,
      targetsExistingContext: targetsExisting || act.targetsExistingContext,
      requiresClarification: act.requiresClarification || needsClarify,
      evidence: [
        ...act.evidence,
        ...links.map((l) => ({
          signal: `entity_link:${l.kind}`,
          source: 'context',
          span: `${l.matchedSpan}→${l.label}`,
        })),
        ...(needsClarify ? [{ signal: 'ambiguous_reference', source: 'references' }] : []),
      ],
    });
  }
  return resolved;
}

export type { Confidence, SpeechUnderstandingContext };
