import type { UniversalContext } from '../types';
import type { InteractionResult } from '@/lib/engine/interactionTypes';
import type { ReconciledOpportunity } from './types';

export function detectOpportunities(
  context: UniversalContext,
  interaction: InteractionResult
): ReconciledOpportunity[] {
  const opportunities: ReconciledOpportunity[] = [];
  const request = interaction.request;

  if (request.locationText && context.reasoning.knownLocations.length > 0) {
    const normalized = request.locationText.trim().toLowerCase();
    const nearby = context.reasoning.knownLocations.find((location) =>
      location.trim().toLowerCase().includes(normalized) || normalized.includes(location.trim().toLowerCase())
    );
    if (nearby) {
      opportunities.push({
        kind: 'spatial',
        message: `This request may connect with the known location “${nearby}”.`,
        confidence: 'medium',
        entityIds: [],
        reason: 'location_overlap',
      });
    }
  }

  const jobs = context.work.jobs.items ?? [];
  if (request.relatedJobText && jobs.length > 0) {
    const needle = request.relatedJobText.toLowerCase();
    const job = jobs.find((item) => item.name.toLowerCase().includes(needle) || needle.includes(item.name.toLowerCase()));
    if (job) {
      opportunities.push({
        kind: 'job',
        message: `This request appears related to the “${job.name}” job.`,
        confidence: 'high',
        entityIds: [job.id],
        reason: 'job_reference_match',
      });
    }
  }

  if (context.movement.travel && /travel|flight|hotel|trip/i.test(request.objectText ?? '')) {
    opportunities.push({
      kind: 'travel',
      message: `This request may relate to the active trip “${context.movement.travel.tripName}”.`,
      confidence: 'medium',
      entityIds: [context.movement.travel.tripId],
      reason: 'active_trip_context',
    });
  }

  return opportunities;
}
