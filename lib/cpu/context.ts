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
    currentFocus: ctx.currentFocus ?? null,

    user: { id: input.userId },

    current: {
      interface: interfaceName,
      surface: ctx.surface ?? null,
      activity: ctx.activity ?? null,
      focus: ctx.currentFocus ?? null,
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
      learned: [],
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
