/**
 * Universal Context selectors.
 *
 * Selectors are deliberately boring in Phase 2: they expose existing context
 * without adding inference or side effects. Brains can depend on these stable
 * selectors instead of reaching into UI-specific context directly.
 */

import type { ContextEntity, UniversalContext } from '../types';

export function selectTodayContext(context: UniversalContext) {
  return context.work.today;
}

export function selectJobsContext(context: UniversalContext) {
  return context.work.jobs;
}

export function selectMeetingsContext(context: UniversalContext) {
  return context.commitments.meetings.items;
}

export function selectCalendarContext(context: UniversalContext) {
  return context.commitments.calendar;
}

export function selectTravelContext(context: UniversalContext) {
  return context.movement.travel;
}

export function selectWorkingMemory(context: UniversalContext) {
  return context.memory.working;
}

export function selectCurrentFocus(context: UniversalContext) {
  return context.current.focus;
}

export function selectEntities(context: UniversalContext): ContextEntity[] {
  return [
    ...context.collections.lists,
    ...context.memory.learned,
    ...context.relationships,
  ];
}
