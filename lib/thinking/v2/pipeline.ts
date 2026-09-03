import { CompletedTaskFacts } from '../types';
import { StructuredObservation } from './observations';
import { deduplicateObservations } from './dedup';
import { rankAll } from './ranking';
import { observeEstimateCalibration } from './calibration';
import { observeTimeOfDay } from './timeOfDay';
import { observeRepeatedCarryover } from './carryover';

export interface ObservationPipelineConfig {
  timezone?: string;
  now?: Date;
}

/**
 * Run the full V2 observation pipeline over task history.
 *
 * The pipeline is:
 *   Raw task history → normalised facts → candidate patterns → evidence
 *   analysis → structured observations → semantic deduplication → ranking.
 *
 * It never fabricates evidence: detectors that cannot compute a legitimate
 * measurement return null and are simply not emitted.
 */
export function runObservationPipeline(
  tasks: CompletedTaskFacts[],
  config: ObservationPipelineConfig = {},
): StructuredObservation[] {
  const tz = config.timezone ?? 'UTC';

  const candidates: StructuredObservation[] = [];

  const estimateCalibration = observeEstimateCalibration(tasks);
  if (estimateCalibration) candidates.push(estimateCalibration);

  const timeOfDay = observeTimeOfDay(tasks, tz);
  if (timeOfDay) candidates.push(timeOfDay);

  const carryover = observeRepeatedCarryover(tasks, tz);
  if (carryover) candidates.push(carryover);

  const deduped = deduplicateObservations(candidates);
  return rankAll(deduped);
}
