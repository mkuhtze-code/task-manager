import type { SystemState } from '@/lib/admin/types';

// Unified status dot + label used across the dashboard. States:
//   operational · warning · error · not_configured · not_monitored
const LABELS: Record<SystemState, string> = {
  operational: 'Operational',
  warning: 'Warning',
  error: 'Error',
  not_configured: 'Not configured',
  not_monitored: 'Not monitored',
};

export default function StatusIndicator({
  state,
  label,
  compact = false,
}: {
  state: SystemState;
  label?: string;
  compact?: boolean;
}) {
  return (
    <span className={`adm-state adm-state-${state}${compact ? ' adm-state-compact' : ''}`}>
      <span className="adm-state-dot" aria-hidden />
      <span>{label ?? LABELS[state]}</span>
    </span>
  );
}

export function stateLabel(state: SystemState): string {
  return LABELS[state];
}