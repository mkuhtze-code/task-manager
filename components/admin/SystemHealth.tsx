import type { InfrastructureItem } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';
import StatusIndicator, { stateLabel } from './StatusIndicator';

export default function SystemHealth({ components }: { components: InfrastructureItem[] }) {
  return (
    <AdminPanel
      title="System health"
      subtitle="Current state of the services Dokkit runs on"
    >
      <ul className="adm-sys-grid">
        {components.map((c) => (
          <li key={c.key} className="adm-sys-item">
            <div className="adm-sys-top">
              <span className="adm-sys-label">{c.label}</span>
              <StatusIndicator state={c.state} compact />
            </div>
            <div className="adm-sys-detail">{c.detail}</div>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}