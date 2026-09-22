/**
 * Dokkit-hosted file storage quotas.
 *
 * Design notes (SOC 2 / ISO 27001 alignment):
 * - Usage counters are server/trigger-maintained; clients must not trust
 *   client-supplied usage figures for authorization.
 * - Limits are enforced before accepting new media bytes.
 * - Admin monitors system totals only — never per-user content in aggregates.
 * - Export + delete is the supported path to free space (data minimization).
 */

/** Default account ceiling: 30 GiB. */
export const DEFAULT_STORAGE_LIMIT_BYTES = 30 * 1024 * 1024 * 1024;

/** Warn in UI when usage reaches this fraction of the limit. */
export const STORAGE_WARN_RATIO = 0.8;

/** Stronger warn near the ceiling. */
export const STORAGE_CRITICAL_RATIO = 0.95;

export type StorageQuota = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  ratio: number;
  state: 'normal' | 'warning' | 'critical' | 'exceeded';
};

export function buildStorageQuota(usedBytes: number, limitBytes: number): StorageQuota {
  const used = Math.max(0, Math.floor(usedBytes || 0));
  const limit = Math.max(0, Math.floor(limitBytes || DEFAULT_STORAGE_LIMIT_BYTES));
  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? used / limit : 0;
  let state: StorageQuota['state'] = 'normal';
  if (used >= limit) state = 'exceeded';
  else if (ratio >= STORAGE_CRITICAL_RATIO) state = 'critical';
  else if (ratio >= STORAGE_WARN_RATIO) state = 'warning';
  return { usedBytes: used, limitBytes: limit, remainingBytes: remaining, ratio, state };
}

/** True if adding `additionalBytes` would exceed the hard limit. */
export function wouldExceedQuota(quota: StorageQuota, additionalBytes: number): boolean {
  const add = Math.max(0, Math.floor(additionalBytes || 0));
  return quota.usedBytes + add > quota.limitBytes;
}

export function formatStorageBytes(bytes: number): string {
  const n = Math.max(0, bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatStoragePercent(ratio: number): string {
  return `${Math.min(100, Math.round((ratio || 0) * 100))}%`;
}
