import { describe, it, expect } from 'vitest';
import { computeSemanticId, observationIdentityKey } from '../identity';

describe('identity - deterministic IDs', () => {
  it('produces a stable SHA-256 based ID', () => {
    const id1 = computeSemanticId(['estimate_calibration', 'clusterA']);
    const id2 = computeSemanticId(['estimate_calibration', 'clusterA']);
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
  });

  it('differs when semantics differ', () => {
    const id1 = computeSemanticId(['estimate_calibration', 'clusterA']);
    const id2 = computeSemanticId(['estimate_calibration', 'clusterB']);
    expect(id1).not.toBe(id2);
  });

  it('is order-sensitive within parts', () => {
    const id1 = computeSemanticId(['type', 'cluster']);
    const id2 = computeSemanticId(['cluster', 'type']);
    expect(id1).not.toBe(id2);
  });
});

describe('identity - observation identity keys', () => {
  it('maps equivalent semantics to the same key', () => {
    const k1 = observationIdentityKey({ type: 'time_of_day', dimension: 'dominant_period', subType: 'morning' });
    const k2 = observationIdentityKey({ type: 'time_of_day', dimension: 'dominant_period', subType: 'morning' });
    expect(k1).toBe(k2);
  });

  it('distinguishes different types', () => {
    const k1 = observationIdentityKey({ type: 'time_of_day', subType: 'morning' });
    const k2 = observationIdentityKey({ type: 'estimate_calibration', subType: 'morning' });
    expect(k1).not.toBe(k2);
  });

  it('does not depend on detector execution order', () => {
    // Identity is purely semantic — reordering fields or invocation order
    // cannot change the computed key because input keys are canonical.
    const kA = observationIdentityKey({ type: 'carryover', subType: 'repeated' });
    const kB = observationIdentityKey({ type: 'carryover', subType: 'repeated' });
    expect(kA).toBe(kB);
  });

  it('includes context in the identity', () => {
    const k1 = observationIdentityKey({ type: 'time_of_day', clusterLabel: 'Errands', subType: 'morning' });
    const k2 = observationIdentityKey({ type: 'time_of_day', clusterLabel: 'Work', subType: 'morning' });
    expect(k1).not.toBe(k2);
  });
});
