import type { UniversalContext } from '../types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import type { ReconciledOpportunity } from './types';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function overlaps(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function requestDateMatches(dateHint: string | null, iso: string | null | undefined): boolean {
  if (!dateHint || !iso) return false;
  const date = iso.slice(0, 10);
  const normalized = normalize(dateHint);
  return normalized === date || normalized.includes(date) || date.includes(normalized);
}

function requestTimeMatches(timeHint: string | null, iso: string | null | undefined): boolean {
  if (!timeHint || !iso) return false;

  const match = timeHint.match(/(?:^|\\s)(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?/i);
  if (!match) return false;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  const meeting = new Date(iso);
  if (Number.isNaN(meeting.getTime())) return false;

  return meeting.getHours() === hour && Math.abs(meeting.getMinutes() - minute) <= 30;
}

function pushOpportunity(
  opportunities: ReconciledOpportunity[],
  opportunity: ReconciledOpportunity,
): void {
  const duplicate = opportunities.some(
    (existing) =>
      existing.kind === opportunity.kind &&
      existing.reason === opportunity.reason &&
      existing.entityIds.join('|') === opportunity.entityIds.join('|'),
  );

  if (!duplicate) opportunities.push(opportunity);
}

/**
 * Phase 8 cross-world reasoning.
 *
 * This layer does not create or move anything. It joins facts that are already
 * present in the universal context and turns those joins into opportunities.
 * Authority and execution remain owned by the existing interaction decision.
 */
export function detectOpportunities(
  context: UniversalContext,
  interaction: InteractionResult
): ReconciledOpportunity[] {
  const opportunities: ReconciledOpportunity[] = [];
  const request = interaction.request;
  const jobs = context.work.jobs.items ?? [];
  const meetings = context.commitments.meetings.items ?? [];
  const workingMemory = context.memory.working;

  // 1. Spatial convergence: requested place ↔ remembered place.
  if (request.locationText) {
    const knownLocation = context.reasoning.knownLocations.find((location) =>
      overlaps(request.locationText, location),
    );

    if (knownLocation) {
      pushOpportunity(opportunities, {
        kind: 'spatial',
        message: `This request may connect with the known location “${knownLocation}”.`,
        confidence: 'medium',
        entityIds: [],
        reason: 'location_overlap',
      });
    }

    // Requested place ↔ job place is stronger than a generic remembered place.
    const locationJob = jobs.find((job) => overlaps(request.locationText, job.locationText));
    if (locationJob) {
      pushOpportunity(opportunities, {
        kind: 'job',
        message: `The location matches the “${locationJob.name}” job.`,
        confidence: 'high',
        entityIds: [locationJob.id],
        reason: 'job_location_convergence',
      });
    }
  }

  // 2. Explicit job reference.
  if (request.relatedJobText && jobs.length > 0) {
    const job = jobs.find((item) =>
      overlaps(request.relatedJobText, item.name),
    );

    if (job) {
      pushOpportunity(opportunities, {
        kind: 'job',
        message: `This request appears related to the “${job.name}” job.`,
        confidence: 'high',
        entityIds: [job.id],
        reason: 'job_reference_match',
      });
    }
  }

  // 3. Explicit meeting reference.
  if (request.relatedMeetingText && meetings.length > 0) {
    const meeting = meetings.find((item) =>
      overlaps(request.relatedMeetingText, item.text),
    );

    if (meeting) {
      pushOpportunity(opportunities, {
        kind: 'meeting',
        message: `This request appears related to the “${meeting.text}” meeting.`,
        confidence: 'high',
        entityIds: [meeting.id],
        reason: 'meeting_reference_match',
      });
    }
  }

  // 4. Temporal convergence: request date/time ↔ an existing meeting.
  const temporalMeeting = meetings.find((meeting) => {
    if (!meeting.startAt) return false;

    const sameDate = requestDateMatches(request.dateHint, meeting.startAt);
    const sameTime = requestTimeMatches(request.timeHint, meeting.startAt);

    if (request.dateHint && request.timeHint) return sameDate && sameTime;
    if (request.dateHint) return sameDate;
    return sameTime;
  });

  if (temporalMeeting) {
    pushOpportunity(opportunities, {
      kind: 'temporal',
      message: `This request overlaps the “${temporalMeeting.text}” meeting.`,
      confidence: request.dateHint && request.timeHint ? 'high' : 'medium',
      entityIds: [temporalMeeting.id],
      reason: 'meeting_time_convergence',
    });
  }

  // 5. Travel convergence: explicit travel language ↔ active trip.
  if (context.movement.travel && /travel|flight|hotel|trip/i.test(request.objectText ?? '')) {
    pushOpportunity(opportunities, {
      kind: 'travel',
      message: `This request may relate to the active trip “${context.movement.travel.tripName}”.`,
      confidence: 'medium',
      entityIds: [context.movement.travel.tripId],
      reason: 'active_trip_context',
    });
  }

  // 6. Working-memory convergence. This is deliberately conservative: it
  // only connects exact/substring matches already learned in this session.
  const rememberedJob = workingMemory.recentJobs.find((job) =>
    overlaps(request.relatedJobText, job.label) ||
    overlaps(request.locationText, job.relationships.location),
  );

  if (rememberedJob) {
    pushOpportunity(opportunities, {
      kind: 'memory',
      message: `This request may connect with the recent “${rememberedJob.label}” context.`,
      confidence: 'medium',
      entityIds: [rememberedJob.id],
      reason: 'working_memory_convergence',
    });
  }

  const rememberedLocation = workingMemory.recentLocations.find((location) =>
    overlaps(request.locationText, location.label),
  );

  if (rememberedLocation) {
    pushOpportunity(opportunities, {
      kind: 'memory',
      message: `This request matches the recently used location “${rememberedLocation.label}”.`,
      confidence: 'medium',
      entityIds: [rememberedLocation.id],
      reason: 'working_memory_location_match',
    });
  }

  return opportunities;
}
