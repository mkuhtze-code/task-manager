/**
 * Universal Context assembly.
 *
 * This does not create a second context model. It wraps the existing
 * InteractionInput/ReasoningContext so every future brain sees the same
 * contextual envelope.
 */

import { assembleContext } from '@/lib/engine';
import type { CpuInput, CpuInterface, UniversalContext } from './types';

function normalizeInterface(value: string | undefined): CpuInterface {
  switch (value) {
    case 'capture':
    case 'today':
    case 'jobs':
    case 'meetings':
    case 'travel':
    case 'voice':
    case 'android':
    case 'android_auto':
      return value;
    default:
      return 'unknown';
  }
}

export function assembleUniversalContext(input: CpuInput): UniversalContext {
  const ctx = input.context;
  const interfaceName = normalizeInterface(
    input.cpu?.interface ?? ctx.interface
  );

  const workingMemory =
    input.workingMemory ??
    assembleContext({
      todayDate: undefined,
      workingMemory: undefined,
    }).workingMemory;

  const reasoning = assembleContext({
    nowIso: new Date().toISOString(),
    surfaceDate: ctx.surface ?? ctx.todayDate ?? null,
    remainingMinsToday: ctx.remainingMinsToday,
    openTaskCount: ctx.openTaskCount,
    jobs: ctx.jobs,
    meetings: ctx.meetings,
    workingMemory,
    travel: ctx.travel
      ? {
          tripId: ctx.travel.tripId,
          tripName: ctx.travel.tripName,
          intent: ctx.travel.intent ?? null,
          dayId: ctx.travel.dayId ?? null,
          dayDate: ctx.travel.dayDate ?? null,
          remainingMins: ctx.travel.remainingMins ?? null,
          plannedMins: ctx.travel.plannedMins ?? 0,
          baseLocationText: ctx.travel.baseLocationText ?? null,
        }
      : null,
  });

  return {
    nowIso: reasoning.nowIso,
    interface: interfaceName,
    activity: ctx.activity ?? null,
    surface: ctx.surface ?? null,
    currentFocus: ctx.currentFocus ?? null,
    reasoning,
    workingMemory,
    interaction: ctx,
  };
}
