import type { CaptureDockResult } from '@/lib/engine/captureDock';

export type DockOutcomeClass = 'act' | 'hard' | 'advisory' | 'clarify';
export type DockSurfaceIntent = 'explicit_create' | 'other';

export type ClassifiedDockOutcome = {
  class: DockOutcomeClass;
  message: string;
};

/**
 * Classifies the engine's interpretation separately from permission to write.
 * Empty drafts and required-field/place gates are enforced by the surface before
 * this policy is consulted; fit/capacity commentary is never a hard block.
 */
export function classifyCaptureDockOutcome(
  result: CaptureDockResult
): ClassifiedDockOutcome {
  switch (result.kind) {
    case 'act_create':
    case 'act_update':
      return { class: 'act', message: result.message };
    case 'answer':
    case 'defer':
      return { class: 'advisory', message: result.message };
    case 'clarify':
    case 'fallthrough':
      return {
        class: 'clarify',
        message: result.message || 'Save the wording as written, or add more detail.',
      };
  }
}

/**
 * Explicit create means the user has already expressed write intent. Advisory
 * and clarification outcomes may explain the trade-off but cannot veto it.
 * Hard checks remain surface-owned and must run before calling this policy.
 */
export function allowCreate(
  surface: DockSurfaceIntent,
  outcomeClass: DockOutcomeClass
): boolean {
  if (outcomeClass === 'hard') return false;
  if (surface === 'explicit_create') {
    return outcomeClass === 'act' || outcomeClass === 'advisory' || outcomeClass === 'clarify';
  }
  return outcomeClass === 'act';
}
