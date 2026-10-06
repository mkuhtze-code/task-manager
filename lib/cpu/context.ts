/**
 * Universal Context assembly.
 *
 * Phase 2 promotes existing context into stable domain-shaped slices. It does
 * not fetch new data, infer relationships, or mutate state.
 */

import { assembleContext } from '@/lib/engine/contextAssembly';
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
    assembleContext({ workingMemory: undefined }).workingMemory;

  // Context is assembled from information already supplied to the interaction.
  // Do not invent world state or perform broad database reads here. Working
  // memory is the first cheap cross-surface bridge; richer selectors can be
  // added later behind an explicit context budget.
  const memoryEntities = [
    ...workingMemory.recentEntities,
    ...workingMemory.recentJobs,
    ...workingMemory.recentLocations,
  ].map((item) => ({
    id: item.id,
    kind:
      item.type === 'job'
        ? 'job' as const
        : item.type === 'location'
          ? 'location' as const
          : 'unknown' as const,
    label: item.label,
    metadata: {
      source: item.source,
      confidence: item.confidence,
    },
  }));

  const currentFocus = ctx.currentFocus ?? workingMemory.currentFocus ?? null;

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

  const todayDate = ctx.todayDate ?? reasoning.surfaceDate ?? null;
  const meetings = ctx.meetings ?? [];
  const jobs = ctx.jobs ?? [];

  return {
    nowIso: reasoning.nowIso,
    interface: interfaceName,
    activity: ctx.activity ?? null,
    surface: ctx.surface ?? null,
    currentFocus,

    user: { id: input.userId },

    current: {
      interface: interfaceName,
      surface: ctx.surface ?? null,
      activity: ctx.activity ?? null,
      focus: currentFocus,
    },

    work: {
      today: {
        date: todayDate,
        remainingMins: ctx.remainingMinsToday ?? null,
        openTaskCount: ctx.openTaskCount ?? 0,
      },
      tasks: {
        knownCount: ctx.openTaskCount ?? 0,
      },
      jobs: {
        items: jobs,
      },
    },

    commitments: {
      // Calendar integration is not yet part of InteractionInput. Do not
      // pretend meeting data is calendar data.
      calendar: {
        available: false,
        commitments: [],
      },
      meetings: {
        items: meetings,
      },
    },

    movement: {
      location: {
        currentText: null,
        knownLocations: reasoning.knownLocations,
      },
      travel: reasoning.travel,
      route: {
        available: false,
      },
    },

    collections: {
      lists: [],
    },

    memory: {
      working: workingMemory,
      learned: memoryEntities,
    },

    relationships: [],

    constraints: {
      remainingMinsToday: ctx.remainingMinsToday ?? null,
      hasActiveTravel: Boolean(reasoning.travel),
    },

    reasoning,
    interaction: ctx,
  };
}
