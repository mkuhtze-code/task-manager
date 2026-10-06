/**
 * Dokkit CPU specialist brains.
 *
 * Phase 6 activates deterministic adapters around intelligence that already
 * exists in the repository. Brains observe; the CPU reconciles and decides.
 * No brain is allowed to veto authority or execute mutations.
 */

import type {
  CpuBrain,
  CpuBrainContribution,
  CpuInput,
  CpuObservation,
  UniversalContext,
} from './types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';

function contribution(
  brain: CpuBrain['id'],
  observations: CpuObservation[] = [],
  relationships: CpuBrainContribution['relationships'] = [],
  evidence: CpuBrainContribution['evidence'] = [],
): CpuBrainContribution {
  return { brain, observations, relationships, evidence };
}

function observation(
  brain: CpuBrain['id'],
  kind: CpuObservation['kind'],
  value: string,
  confidence: CpuObservation['confidence'],
  evidence?: string[],
): CpuObservation {
  return { brain, kind, value, confidence, ...(evidence?.length ? { evidence } : {}) };
}

function coreBrainContribution(
  input: CpuInput,
  _context: UniversalContext,
  interaction: InteractionResult,
): CpuBrainContribution {
  return contribution(
    'thinking',
    [
      observation('thinking', 'decision', `interaction_outcome=${interaction.outcome}`, interaction.confidence, interaction.facts),
      observation('authority', 'constraint', interaction.authority.reason, interaction.confidence),
      observation('memory', 'fact', `working_memory_available=${Boolean(interaction.workingMemory)}`, 'high'),
      ...(interaction.request.locationText
        ? [observation('location', 'fact', `location=${interaction.request.locationText}`, interaction.request.confidence)]
        : []),
      ...(interaction.request.relatedJobText
        ? [observation('jobs', 'relationship', `job_reference=${interaction.request.relatedJobText}`, interaction.request.confidence)]
        : []),
      ...(input.input.type === 'speech_transcript'
        ? [observation('speech', 'fact', 'speech_transcript_received', input.input.confidence ?? 'medium')]
        : []),
    ],
    [],
    interaction.evidence,
  );
}

export const coreBrain: CpuBrain = {
  id: 'thinking',
  contribute: coreBrainContribution,
};

const speechBrain: CpuBrain = {
  id: 'speech',
  contribute(input, _context, interaction) {
    const req = interaction.request;
    const observations: CpuObservation[] = [
      observation('speech', 'fact', `input_type=${input.input.type}`, input.input.type === 'speech_transcript' ? (input.input.confidence ?? 'medium') : 'high'),
    ];
    if (req.objectText) observations.push(observation('speech', 'fact', `object=${req.objectText}`, req.confidence));
    if (req.dateHint) observations.push(observation('speech', 'fact', `date=${req.dateHint}`, req.confidence));
    if (req.timeHint) observations.push(observation('speech', 'fact', `time=${req.timeHint}`, req.confidence));
    if (req.commitment === 'hard') observations.push(observation('speech', 'fact', 'explicit_hard_commitment', 'high'));
    return contribution('speech', observations, [], interaction.evidence.filter(e => e.kind === 'interpretation' || e.kind === 'correction'));
  },
};

const tasksBrain: CpuBrain = {
  id: 'tasks',
  contribute(_input, context, interaction) {
    const req = interaction.request;
    const action = interaction.action;
    const observations: CpuObservation[] = [
      observation('tasks', 'fact', `known_open_tasks=${context.work.tasks.knownCount}`, 'high'),
    ];
    if (req.action === 'create_task' || req.action === 'remind' || req.action === 'pickup') {
      observations.push(observation('tasks', 'decision', `task_intent=${req.action}`, req.confidence));
    }
    if (action?.kind === 'create_task') {
      observations.push(observation('tasks', 'decision', `task_action=${action.text}`, interaction.confidence));
    }
    if (context.work.today.remainingMins != null) {
      observations.push(observation('tasks', 'constraint', `remaining_today_mins=${context.work.today.remainingMins}`, 'high'));
    }
    return contribution('tasks', observations);
  },
};

const jobsBrain: CpuBrain = {
  id: 'jobs',
  contribute(_input, context, interaction) {
    const req = interaction.request;
    const jobs = context.work.jobs.items ?? [];
    const observations: CpuObservation[] = [
      observation('jobs', 'fact', `known_jobs=${jobs.length}`, 'high'),
    ];
    if (req.relatedJobText) {
      const needle = req.relatedJobText.toLowerCase();
      const match = jobs.find(j => j.name.toLowerCase().includes(needle) || needle.includes(j.name.toLowerCase()));
      observations.push(observation('jobs', match ? 'relationship' : 'fact',
        match ? `matched_job=${match.id}` : `unmatched_job_reference=${req.relatedJobText}`,
        match ? 'high' : req.confidence));
    }
    return contribution('jobs', observations);
  },
};

const meetingsBrain: CpuBrain = {
  id: 'meetings',
  contribute(_input, context, interaction) {
    const req = interaction.request;
    const meetings = context.commitments.meetings.items ?? [];
    const observations: CpuObservation[] = [
      observation('meetings', 'fact', `known_meetings=${meetings.length}`, 'high'),
    ];
    if (req.relatedMeetingText) {
      const needle = req.relatedMeetingText.toLowerCase();
      const match = meetings.find(m => m.text.toLowerCase().includes(needle) || needle.includes(m.text.toLowerCase()));
      observations.push(observation('meetings', match ? 'relationship' : 'fact',
        match ? `matched_meeting=${match.id}` : `unmatched_meeting_reference=${req.relatedMeetingText}`,
        match ? 'high' : req.confidence));
    }
    return contribution('meetings', observations);
  },
};

const travelBrain: CpuBrain = {
  id: 'travel',
  contribute(_input, context, interaction) {
    const t = context.movement.travel;
    if (!t) return contribution('travel', [observation('travel', 'no_signal', 'no_active_travel_context', 'high')]);
    return contribution('travel', [
      observation('travel', 'fact', `active_trip=${t.tripId}`, 'high'),
      observation('travel', 'fact', `trip_remaining_mins=${t.remainingMins ?? 'unknown'}`, t.remainingMins != null ? 'high' : 'medium'),
      ...(t.baseLocationText ? [observation('travel', 'fact', `base_location=${t.baseLocationText}`, 'high')] : []),
    ]);
  },
};

const calendarBrain: CpuBrain = {
  id: 'calendar',
  contribute(_input, context) {
    if (!context.commitments.calendar.available) {
      return contribution('calendar', [observation('calendar', 'no_signal', 'calendar_context_not_available', 'high')]);
    }
    return contribution('calendar', [
      observation('calendar', 'fact', `calendar_commitments=${(context.commitments.calendar.commitments ?? []).length}`, 'high'),
    ]);
  },
};

const locationBrain: CpuBrain = {
  id: 'location',
  contribute(_input, context, interaction) {
    const location = interaction.request.locationText;
    const known = context.movement.location.knownLocations;
    const observations: CpuObservation[] = [
      observation('location', 'fact', `known_locations=${known.length}`, 'high'),
    ];
    if (location) {
      const normalized = location.toLowerCase();
      const match = known.find(x => x.toLowerCase().includes(normalized) || normalized.includes(x.toLowerCase()));
      observations.push(observation('location', match ? 'relationship' : 'fact',
        match ? `known_location_match=${match}` : `requested_location=${location}`,
        match ? 'high' : interaction.request.confidence));
    }
    return contribution('location', observations);
  },
};

const memoryBrain: CpuBrain = {
  id: 'memory',
  contribute(_input, context) {
    const wm = context.memory.working;
    return contribution('memory', [
      observation('memory', 'fact', `recent_tasks=${wm.recentTasks.length}`, 'high'),
      observation('memory', 'fact', `recent_jobs=${wm.recentJobs.length}`, 'high'),
      observation('memory', 'fact', `recent_locations=${wm.recentLocations.length}`, 'high'),
      observation('memory', 'fact', `active_request=${wm.activeRequestId ?? 'none'}`, 'high'),
    ]);
  },
};

const learningBrain: CpuBrain = {
  id: 'learning',
  contribute(_input, _context, interaction) {
    return contribution('learning', [
      observation('learning', 'fact', `evidence_events=${interaction.evidence.length}`, interaction.evidence.length ? 'high' : 'medium'),
    ], [], interaction.evidence);
  },
};

const authorityBrain: CpuBrain = {
  id: 'authority',
  contribute(_input, _context, interaction) {
    return contribution('authority', [
      observation('authority', 'decision',
        `commitment=${interaction.authority.commitmentClass};autonomy=${interaction.authority.autonomy};mayAct=${interaction.authority.mayAct}`,
        'high'),
      observation('authority', 'constraint', interaction.authority.reason, 'high'),
    ]);
  },
};

/**
 * Every activated brain is observational. The existing deterministic
 * interaction core remains the execution authority until the universal
 * dispatcher is fully wired.
 */
export const DEFAULT_BRAINS: CpuBrain[] = [
  coreBrain,
  speechBrain,
  tasksBrain,
  jobsBrain,
  meetingsBrain,
  travelBrain,
  calendarBrain,
  locationBrain,
  memoryBrain,
  learningBrain,
  authorityBrain,
];
