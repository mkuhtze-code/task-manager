import type { CpuBrainContribution } from '../types';
import type { ReconciledConflict } from './types';

export function detectConflicts(contributions: CpuBrainContribution[]): ReconciledConflict[] {
  const observations = contributions.flatMap((c) => c.observations);
  const conflicts: ReconciledConflict[] = [];

  const decisions = observations.filter((o) => o.kind === 'decision');
  const decisionValues = new Set(decisions.map((o) => o.value));
  if (decisionValues.size > 1) {
    conflicts.push({
      kind: 'action',
      severity: 'medium',
      message: 'Specialist contributions contain different decision signals.',
      evidence: decisions.map((o) => o.value),
    });
  }

  const constraints = observations.filter((o) => o.kind === 'constraint');
  if (constraints.some((o) => /cannot|blocked|refus|not allowed/i.test(o.value))) {
    conflicts.push({
      kind: 'context',
      severity: 'medium',
      message: 'A contextual constraint may affect execution.',
      evidence: constraints.map((o) => o.value),
    });
  }

  return conflicts;
}
