/**
 * Structure conditions and dependencies on acts — never promote them to tasks.
 */

import type { Confidence } from '../types';
import type { SemanticCondition, SemanticDependency } from './types';

export function extractCondition(clause: string): SemanticCondition | undefined {
  const ifM = clause.match(/\bif\s+(.{3,80}?)(?=$|[.!?])/i);
  if (ifM) {
    return { raw: ifM[0].trim(), kind: 'if', confidence: 'medium' };
  }
  const unlessM = clause.match(/\bunless\s+(.{3,80}?)(?=$|[.!?])/i);
  if (unlessM) {
    return { raw: unlessM[0].trim(), kind: 'unless', confidence: 'medium' };
  }
  const whenM = clause.match(/\bwhen\s+(.{3,60}?)(?=$|[.!?])/i);
  if (whenM && !/^\s*when\s+(?:monday|tuesday|wednesday|thursday|friday)/i.test(clause)) {
    return { raw: whenM[0].trim(), kind: 'when', confidence: 'low' };
  }
  return undefined;
}

export function extractDependency(clause: string): SemanticDependency | undefined {
  const afterM = clause.match(/\bafter\s+(?:i\s+)?(.{3,60}?)(?=$|[.!?])/i);
  if (afterM && !/\bafter\s+lunch\b/i.test(clause)) {
    return { raw: afterM[0].trim(), kind: 'after', confidence: 'medium' };
  }
  const beforeM = clause.match(/\bbefore\s+(?:i\s+)?(.{3,60}?)(?=$|[.!?])/i);
  if (beforeM && !/\bbefore\s+lunch\b/i.test(clause)) {
    return { raw: beforeM[0].trim(), kind: 'before', confidence: 'medium' };
  }
  const onceM = clause.match(/\bonce\s+(.{3,60}?)(?=$|[.!?])/i);
  if (onceM) {
    return { raw: onceM[0].trim(), kind: 'once', confidence: 'medium' };
  }
  const untilM = clause.match(/\buntil\s+(.{3,60}?)(?=$|[.!?])/i);
  if (untilM) {
    return { raw: untilM[0].trim(), kind: 'until', confidence: 'medium' };
  }
  return undefined;
}

export function isActionWithCondition(clause: string, hasActionVerb: boolean): boolean {
  if (!hasActionVerb) return false;
  return /\b(?:if|unless)\b/i.test(clause);
}
