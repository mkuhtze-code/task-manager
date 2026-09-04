import { CompletedTaskFacts } from '../types';
import { StructuredObservation } from './observations';
import { deduplicateObservations } from './dedup';
import { rankAll } from './ranking';
import { observeEstimateCalibration } from './calibration';
import { observeTimeOfDay } from './timeOfDay';
import { observeRepeatedCarryover } from './carryover';
import { observeV2TaskContext } from './taskContext';
import { observeV2Lifecycle } from './lifecycle';
import { observeV2Decomposition } from './decomposition';
import { observeV2Staleness } from './staleness';
import { observeV2Clusters } from './cluster';
import { observeV2TemporalBehaviour } from './temporalBehaviour';

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

  candidates.push(...observeV2TaskContext(tasks));
  candidates.push(...observeV2Lifecycle(tasks, tz));
  candidates.push(...observeV2Decomposition(tasks));
  candidates.push(...observeV2Staleness(tasks, tz));
  candidates.push(...observeV2Clusters(tasks));
  candidates.push(...observeV2TemporalBehaviour(tasks, tz));

  const deduped = deduplicateObservations(candidates);
  return rankAll(deduped);
}
