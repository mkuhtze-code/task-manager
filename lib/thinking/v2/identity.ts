import { createHash } from 'crypto';

export function computeSemanticId(parts: string[]): string {
  const input = parts.join('|');
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function observationIdentityKey(params: {
  type: string;
  clusterLabel?: string;
  timePeriod?: string;
  location?: string;
  jobId?: string;
  dimension?: string;
  subType?: string;
}): string {
  return computeSemanticId([
    params.type,
    params.clusterLabel ?? '',
    params.timePeriod ?? '',
    params.location ?? '',
    params.jobId ?? '',
    params.dimension ?? '',
    params.subType ?? '',
  ]);
}
