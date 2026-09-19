import type { SystemState } from '@/lib/admin/types';

export type StatusItem = {
  key: string;
  label: string;
  state: SystemState;
  detail: string;
};

const STATE_LABEL: Record<SystemState, string> = {
  operational: 'Operational',
  warning: 'Warning',
  error: 'Error',
  not_configured: 'Not configured',
  not_monitored: 'Not monitored',
};

export default function StatusList({ items }: { items: StatusItem[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.key}
          className="settings-panel"
          style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'flex-start' }}
        >
          <span
            className={`adm-status-pill adm-status-${item.state}`}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {STATE_LABEL[item.state]}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13 }}>{item.label}</strong>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{item.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
